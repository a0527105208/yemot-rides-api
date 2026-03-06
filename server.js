const express = require("express");
const mongoose = require("mongoose");

const app = express();
const port = process.env.PORT || 3000;

// כתובת ה-API שלך ב-Render
const BASE_URL = "https://yemot-rides.onrender.com/ivr-api";

// חיבור למסד הנתונים
const mongoURI = "mongodb+srv://a0527105208:723815924@lerner.nueskna.mongodb.net/?appName=LERNER";

/* ---------------- MongoDB Setup ---------------- */

mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("Mongo connected successfully"))
.catch(err => console.error("Mongo connection error:", err));

/* ---------------- Data Models ---------------- */

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

/* ---------------- API Endpoint ---------------- */

app.get("/ivr-api", async (req, res) => {
    // הגדרת Header קריטי לימות המשיח למניעת בעיות קידוד
    res.set('Content-Type', 'text/plain; charset=utf-8');

    const ApiPhone = req.query.ApiPhone || req.query.phone;
    const ApiDigits = req.query.ApiDigits;
    const action = req.query.action;
    
    // שליפת פרמטרים נוספים מה-URL
    const { t, d, tm, s, r_id } = req.query;

    console.log(`Incoming request: action=${action}, phone=${ApiPhone}, digits=${ApiDigits}`);

    if (!ApiPhone || ApiPhone === "anonymous") {
        return res.send("say=t-המערכת דורשת זיהוי טלפוני, הכניסה ממספר חסוי אינה אפשרית&goto_all_endpoints=exit");
    }

    try {
        let user = await User.findOne({ phone: ApiPhone });
        if (!user) {
            user = await User.create({ phone: ApiPhone });
        }

        /* ---------- כניסה ראשונית: בדיקת רישום ---------- */
        if (!action) {
            if (!user.name_recorded) {
                // שלב 1: הודעה למשתמש
                // על פי התיעוד, נשתמש ב-read כדי לקבל אישור הקלטה או לעבור להקלטה
                return res.send(
                    `read=t-שלום, אינכם רשומים במערכת. מיד לאחר הביפ הקליטו את שמכם המלא ובסיומו הקישו סולמית. להמשך הקישו 1=digits,1,1,1,7,Number,no,no&action=pre_record`
                );
            } else {
                return res.send(`go_to=${BASE_URL}?action=main`);
            }
        }

        /* ---------- שלב הקלטת שם ---------- */
        if (action === "pre_record") {
            // מבנה פקודת record לפי התיעוד: record=שם_הקובץ,תיקיה,מספר_הקלטות,השמעת_ביפ,השמעה_חוזרת
            // אנחנו שולחים את המשתמש להקליט ואז ה-API יקבל קריאה חוזרת עם action=reg
            return res.send(`record=name_${ApiPhone},/users,1,yes,no&action=reg`);
        }

        if (action === "reg") {
            await User.updateOne({ phone: ApiPhone }, { name_recorded: true });
            return res.send(`say=t-נרשמתם בהצלחה&go_to=${BASE_URL}?action=main`);
        }

        /* ---------- תפריט ראשי ---------- */
        if (action === "main") {
            return res.send(
                `read=t-לתפריט נהג הקישו 1, לתפריט נוסע הקישו 2, למחיקת נסיעות שלכם הקישו 3=digits,1,1,1,7,Number,no,no&action=h_main`
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
                `read=t-לפרסום נסיעה חדשה הקישו 1, לשמיעת בקשות של נוסעים הקישו 2=digits,1,1,1,7,Number,no,no&action=h_d`
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
                `read=t-לבקשת נסיעה חדשה הקישו 1, לשמיעת נסיעות מנהגים הקישו 2=digits,1,1,1,7,Number,no,no&action=h_p`
            );
        }

        if (action === "h_p") {
            if (ApiDigits === "1") return res.send(`go_to=${BASE_URL}?action=sel_dir&t=passenger`);
            if (ApiDigits === "2") return res.send(`go_to=${BASE_URL}?action=list&list_t=driver`);
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        /* ---------- בחירת מסלול ---------- */
        if (action === "sel_dir") {
            return res.send(
                `read=t-לנסיעה מאשדוד לבני ברק הקישו 1, מבני ברק לאשדוד הקישו 2=digits,1,1,1,7,Number,no,no&action=h_dir&t=${t}`
            );
        }

        if (action === "h_dir") {
            if (t === "driver") {
                return res.send(
                    `read=t-נא הקישו את שעת היציאה ב-4 ספרות, לדוגמה 0 8 0 0 לשעה שמונה בבוקר=digits,4,4,10,7,Number,no,no&action=set_time&t=${t}&d=${ApiDigits}`
                );
            }
            // נוסע לא חייב שעה כרגע, עובר ישר לסיום
            return res.send(`go_to=${BASE_URL}?action=finish&t=${t}&d=${ApiDigits}`);
        }

        if (action === "set_time") {
            return res.send(
                `read=t-כמה מקומות פנויים יש בנסיעה?=digits,1,1,7,7,Number,no,no&action=finish&t=${t}&d=${d}&tm=${ApiDigits}`
            );
        }

        /* ---------- שמירת נתונים ---------- */
        if (action === "finish") {
            await Ride.create({
                type: t,
                driver_phone: ApiPhone,
                direction: d,
                time: tm || "",
                seats: ApiDigits || ""
            });
            return res.send(`say=t-הנתונים נשמרו בהצלחה במערכת&go_to=${BASE_URL}?action=main`);
        }

        /* ---------- שמיעת רשימה ---------- */
        if (action === "list") {
            const listT = req.query.list_t;
            const items = await Ride.find({ type: listT }).sort({ createdAt: -1 }).limit(1);
            
            if (items.length === 0) {
                return res.send(`say=t-אין כרגע פרסומים רלוונטיים&go_to=${BASE_URL}?action=main`);
            }

            const item = items[0];
            const dirTxt = item.direction === "1" ? "מאשדוד לבני ברק" : "מבני ברק לאשדוד";
            
            let msg = `t-נמצאה נסיעה ${dirTxt} `;
            if (item.time) msg += ` בשעה ${item.time} `;
            if (item.seats) msg += ` עם ${item.seats} מקומות `;
            msg += ". לחיוג למפרסם הקישו 0, לחזרה לתפריט הקודם הקישו 2";
            
            return res.send(`read=${msg}=digits,1,1,7,7,Number,no,no&action=list_opt&r_id=${item._id}`);
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

        /* ---------- מחיקת נסיעות ---------- */
        if (action === "del") {
            const count = await Ride.countDocuments({ driver_phone: ApiPhone });
            if (count === 0) return res.send(`say=t-לא נמצאו נסיעות על שמכם&go_to=${BASE_URL}?action=main`);
            return res.send(`read=t-נמצאו ${count} נסיעות שפרסמתם. למחיקת כולן הקישו 7, לביטול הקישו כל מקש אחר=digits,1,1,7,7,Number,no,no&action=del_ok`);
        }

        if (action === "del_ok" && ApiDigits === "7") {
            await Ride.deleteMany({ driver_phone: ApiPhone });
            return res.send(`say=t-כל הנסיעות שלכם נמחקו בהצלחה&go_to=${BASE_URL}?action=main`);
        }

        return res.send(`go_to=${BASE_URL}?action=main`);

    } catch (err) {
        console.error("Critical Error:", err);
        return res.send(`say=t-אירעה שגיאה זמנית בשרת. נא נסו שנית מאוחר יותר&goto_all_endpoints=exit`);
    }
});

app.listen(port, () => { console.log("Server started on port", port); });
