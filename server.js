const express = require("express");
const mongoose = require("mongoose");

const app = express();
const port = process.env.PORT || 3000;

// וודא שכתובת זו מעודכנת לכתובת ה-Render שלך
const BASE_URL = "https://yemot-rides.onrender.com/ivr-api";

// כתובת החיבור המעודכנת שסיפקת
const mongoURI = "mongodb+srv://a0527105208:723815924@lerner.nueskna.mongodb.net/?appName=LERNER";

/* ---------------- MongoDB ---------------- */

mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("Mongo connected successfully"))
.catch(err => console.error("Mongo connection error:", err));

/* ---------------- Models ---------------- */

const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    name_recorded: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const rideSchema = new mongoose.Schema({
    type: { type: String, enum: ["driver", "passenger"], required: true },
    driver_phone: { type: String, required: true },
    direction: String,
    time: String,
    seats: String,
    createdAt: { type: Date, default: Date.now, expires: 10800 } 
});

const User = mongoose.model("User", userSchema);
const Ride = mongoose.model("Ride", rideSchema);

/* ---------------- IVR API ---------------- */

app.get("/ivr-api", async (req, res) => {
    // הגדרת Header קריטי לימות המשיח
    res.set('Content-Type', 'text/plain; charset=utf-8');

    const ApiPhone = req.query.ApiPhone || req.query.phone;
    const ApiDigits = req.query.ApiDigits;
    const action = req.query.action;
    
    // בדיקת בדיקה מהירה: אם המשתמש מקיש כוכבית (בימות המשיח זה מגיע כ-*)
    if (ApiDigits === "*" || ApiDigits === "s") {
        return res.send("say=t-המערכת מחוברת לשרת בהצלחה&goto_all_endpoints=exit");
    }

    const { t, d, tm, s, r_id } = req.query;

    console.log(`Log: action=${action}, phone=${ApiPhone}, digits=${ApiDigits}`);

    if (!ApiPhone || ApiPhone === "anonymous") {
        return res.send("say=t-מספר חסוי. המערכת דורשת זיהוי טלפוני&goto_all_endpoints=exit");
    }

    try {
        let user = await User.findOne({ phone: ApiPhone });
        if (!user) {
            user = await User.create({ phone: ApiPhone });
        }

        /* ---------- כניסה ראשונית ---------- */
        if (!action) {
            if (!user.name_recorded) {
                // שלב הקלטת שם - הגדרת מינימום 1 ספרה (סולמית לסיום)
                return res.send(
                    `read=t-שלום הקליטו שם מלא ובסיום הקישו סולמית. לבדיקת חיבור הקישו כוכבית` +
                    `=record,no,1,1,7,yes,no&action=reg`
                );
            } else {
                // תפריט ראשי - הקשה של ספרה אחת בדיוק
                return res.send(
                    `read=t-שלום לנהג הקישו 1 לנוסע 2 למחיקה 3. לבדיקת חיבור הקישו כוכבית` +
                    `=digits,1,1,1,7,yes,no&action=h_main`
                );
            }
        }

        /* ---------- רישום ---------- */
        if (action === "reg") {
            // אם המשתמש הקיש כוכבית במקום להקליט
            if (ApiDigits === "*") return res.send("say=t-חיבור תקין&goto_all_endpoints=exit");
            
            await User.updateOne({ phone: ApiPhone }, { name_recorded: true });
            return res.send(`say=t-נרשמתם בהצלחה&go_to=${BASE_URL}?action=main`);
        }

        /* ---------- תפריט ראשי ---------- */
        if (action === "main") {
            return res.send(
                `read=t-לנהג הקישו 1 לנוסע 2 למחיקה 3` +
                `=digits,1,1,1,7,yes,no&action=h_main`
            );
        }

        if (action === "h_main") {
            if (ApiDigits === "1") return res.send(`go_to=${BASE_URL}?action=d_menu`);
            if (ApiDigits === "2") return res.send(`go_to=${BASE_URL}?action=p_menu`);
            if (ApiDigits === "3") return res.send(`go_to=${BASE_URL}?action=del`);
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        /* ---------- תפריט נהג ---------- */
        if (action === "d_menu") {
            return res.send(
                `read=t-לפרסום נסיעה 1 לשמיעת נוסעים 2` +
                `=digits,1,1,1,7,yes,no&action=h_d`
            );
        }

        if (action === "h_d") {
            if (ApiDigits === "1") return res.send(`go_to=${BASE_URL}?action=sel_dir&t=driver`);
            if (ApiDigits === "2") return res.send(`go_to=${BASE_URL}?action=list&list_t=passenger`);
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        /* ---------- תפריט נוסע ---------- */
        if (action === "p_menu") {
            return res.send(
                `read=t-לבקשת נסיעה 1 לשמיעת נהגים 2` +
                `=digits,1,1,1,7,yes,no&action=h_p`
            );
        }

        if (action === "h_p") {
            if (ApiDigits === "1") return res.send(`go_to=${BASE_URL}?action=sel_dir&t=passenger`);
            if (ApiDigits === "2") return res.send(`go_to=${BASE_URL}?action=list&list_t=driver`);
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        /* ---------- בחירת כיוון ---------- */
        if (action === "sel_dir") {
            return res.send(
                `read=t-מאשדוד לבני ברק 1 מבני ברק לאשדוד 2` +
                `=digits,1,1,1,7,yes,no&action=h_dir&t=${t}`
            );
        }

        if (action === "h_dir") {
            if (t === "driver") {
                return res.send(
                    `read=t-הקישו שעת יציאה בארבע ספרות` +
                    `=digits,4,4,4,7,yes,no&action=set_time&t=${t}&d=${ApiDigits}`
                );
            }
            return res.send(`go_to=${BASE_URL}?action=finish&t=${t}&d=${ApiDigits}`);
        }

        if (action === "set_time") {
            return res.send(
                `read=t-מספר מקומות פנויים` +
                `=digits,1,1,1,7,yes,no&action=finish&t=${t}&d=${d}&tm=${ApiDigits}`
            );
        }

        /* ---------- שמירה ---------- */
        if (action === "finish") {
            await Ride.create({
                type: t,
                driver_phone: ApiPhone,
                direction: d,
                time: tm || "",
                seats: ApiDigits || ""
            });
            return res.send(`say=t-נשמר בהצלחה&go_to=${BASE_URL}?action=main`);
        }

        /* ---------- רשימה ---------- */
        if (action === "list") {
            const listT = req.query.list_t;
            const items = await Ride.find({ type: listT }).sort({ createdAt: -1 }).limit(1);
            
            if (items.length === 0) {
                return res.send(`say=t-אין כרגע פרסומים&go_to=${BASE_URL}?action=main`);
            }

            const item = items[0];
            const dirTxt = item.direction === "1" ? "מאשדוד לבני ברק" : "מבני ברק לאשדוד";
            
            let msg = `t-נסיעה ${dirTxt} `;
            if (item.time) msg += ` בשעה ${item.time} `;
            if (item.seats) msg += ` עם ${item.seats} מקומות `;
            msg += " לחיוג הקישו 0 לחזרה 2";
            
            return res.send(`read=${msg}=digits,1,1,1,7,yes,no&action=list_opt&r_id=${item._id}`);
        }

        if (action === "list_opt") {
            if (ApiDigits === "0") {
                const ride = await Ride.findById(r_id);
                if (ride) {
                    return res.send(`api_link=dial&phone=${ride.driver_phone}`);
                }
            }
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        /* ---------- מחיקה ---------- */
        if (action === "del") {
            const count = await Ride.countDocuments({ driver_phone: ApiPhone });
            if (count === 0) return res.send(`say=t-אין לכם פרסומים&go_to=${BASE_URL}?action=main`);
            return res.send(`read=t-נמצאו ${count} פרסומים למחיקה הקישו 7 לביטול כל מקש=digits,1,1,1,7,yes,no&action=del_ok`);
        }

        if (action === "del_ok" && ApiDigits === "7") {
            await Ride.deleteMany({ driver_phone: ApiPhone });
            return res.send(`say=t-נמחק בהצלחה&go_to=${BASE_URL}?action=main`);
        }

        return res.send(`go_to=${BASE_URL}?action=main`);

    } catch (err) {
        console.error("Error:", err);
        return res.send(`say=t-תקלה בשרת נסו שנית&goto_all_endpoints=exit`);
    }
});

app.listen(port, () => { console.log("Server running on port", port); });
