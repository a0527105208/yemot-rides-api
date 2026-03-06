const express = require("express");
const mongoose = require("mongoose");

const app = express();
const port = process.env.PORT || 3000;

const BASE_URL = "https://yemot-rides.onrender.com/ivr-api";
const mongoURI = process.env.MONGO_URI;

/* ---------------- MongoDB ---------------- */

mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("Mongo connected"))
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
    note_id: String,
    createdAt: { type: Date, default: Date.now, expires: 10800 } // נמחק אוטומטית אחרי 3 שעות
});

const User = mongoose.model("User", userSchema);
const Ride = mongoose.model("Ride", rideSchema);

/* ---------------- IVR API ---------------- */

app.get("/ivr-api", async (req, res) => {
    const ApiPhone = req.query.ApiPhone || req.query.phone;
    const { ApiDigits, action, t, d, tm, s, r_id } = req.query;

    console.log("Incoming Request:", req.query);

    // בדיקת זיהוי טלפון
    if (!ApiPhone || ApiPhone === "anonymous") {
        return res.send("say=t-לא ניתן לזהות את מספר הטלפון, אנא וודאו שאינכם מחייגים ממספר חסוי&goto_all_endpoints=exit");
    }

    try {
        let user = await User.findOne({ phone: ApiPhone });
        
        // יצירת משתמש אם לא קיים
        if (!user) {
            user = await User.create({ phone: ApiPhone });
        }

        /* ---------- טיפול במקרה של כניסה ראשונית (ללא action) ---------- */
        if (!action) {
            if (!user.name_recorded) {
                return res.send(
                    `read=t-שלום, ברוכים הבאים למערכת הטרמפים. אינכם רשומים במערכת. הקליטו את שמכם המלא לאחר הצליל וסיימו בסולמית` +
                    `=record,no,1,10,7,yes,no&action=reg`
                );
            } else {
                // אם כבר רשום, העבר לתפריט ראשי
                return res.send(`go_to=${BASE_URL}?action=main`);
            }
        }

        /* ---------- רישום שם ---------- */
        if (action === "reg") {
            await User.updateOne({ phone: ApiPhone }, { name_recorded: true });
            return res.send(`say=t-ההרשמה הושלמה בהצלחה&go_to=${BASE_URL}?action=main`);
        }

        /* ---------- תפריט ראשי ---------- */
        if (action === "main") {
            return res.send(
                `read=t-לנהגים הקישו 1, לנוסעים הקישו 2, למחיקת הפרסומים שלכם הקישו 3` +
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
                `read=t-לפרסום נסיעה חדשה הקישו 1, לשמיעת בקשות של נוסעים הקישו 2` +
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
                `read=t-לבקשת נסיעה הקישו 1, לשמיעת נהגים פנויים הקישו 2` +
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
                `read=t-מאשדוד לבני ברק הקישו 1, מבני ברק לאשדוד הקישו 2` +
                `=digits,1,1,1,7,yes,no&action=h_dir&t=${t}`
            );
        }

        if (action === "h_dir") {
            if (t === "driver") {
                return res.send(
                    `read=t-הקישו שעת יציאה ב-4 ספרות, לדוגמה 0 8 0 0 לשעה שמונה` +
                    `=digits,4,1,4,7,yes,no&action=set_time&t=${t}&d=${ApiDigits}`
                );
            }
            return res.send(`go_to=${BASE_URL}?action=finish&t=${t}&d=${ApiDigits}`);
        }

        if (action === "set_time") {
            return res.send(
                `read=t-הקישו מספר מקומות פנויים בנסיעה` +
                `=digits,1,1,2,7,yes,no&action=finish&t=${t}&d=${d}&tm=${ApiDigits}`
            );
        }

        /* ---------- שמירת הנסיעה ---------- */
        if (action === "finish") {
            await Ride.create({
                type: t,
                driver_phone: ApiPhone,
                direction: d,
                time: tm || "",
                seats: ApiDigits || ""
            });
            return res.send(`say=t-הפרסום נשמר בהצלחה והוא יוסר אוטומטית בעוד שלוש שעות&go_to=${BASE_URL}?action=main`);
        }

        /* ---------- הצגת רשימה ---------- */
        if (action === "list") {
            const listT = req.query.list_t;
            const items = await Ride.find({ type: listT }).sort({ createdAt: -1 }).limit(1);
            
            if (items.length === 0) {
                return res.send(`say=t-אין כרגע פרסומים בקטגוריה זו&go_to=${BASE_URL}?action=main`);
            }

            const item = items[0];
            const dirTxt = item.direction === "1" ? "מאשדוד לבני ברק" : "מבני ברק לאשדוד";
            
            let msg = `t-נסיעה ${dirTxt}. .`;
            if (item.time) msg += `t-בשעה ${item.time}. .`;
            if (item.seats) msg += `t-עם ${item.seats} מקומות פנויים. .`;
            msg += "t-לחיוג למפרסם הקישו 0, לשמיעת הפרסום הבא הקישו 1, לחזרה לתפריט הקישו 2";
            
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

        /* ---------- מחיקת פרסומים ---------- */
        if (action === "del") {
            const count = await Ride.countDocuments({ driver_phone: ApiPhone });
            if (count === 0) return res.send(`say=t-אין לכם פרסומים פעילים כרגע&go_to=${BASE_URL}?action=main`);
            return res.send(`read=t-נמצאו ${count} פרסומים שלכם. למחיקת כולם הקישו 7, לביטול הקישו כל מקש אחר=digits,1,1,1,7,yes,no&action=del_ok`);
        }

        if (action === "del_ok" && ApiDigits === "7") {
            await Ride.deleteMany({ driver_phone: ApiPhone });
            return res.send(`say=t-כל הפרסומים שלכם נמחקו בהצלחה&go_to=${BASE_URL}?action=main`);
        }

        return res.send(`go_to=${BASE_URL}?action=main`);

    } catch (err) {
        console.error("Critical Error:", err);
        return res.send(`say=t-מצטערים, חלה תקלה זמנית במערכת&goto_all_endpoints=exit`);
    }
});

app.listen(port, () => { console.log("Server running on port", port); });
