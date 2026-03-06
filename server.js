const express = require('express');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

const BASE_URL = "https://yemot-rides.onrender.com/ivr-api";
const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("Connected to MongoDB"))
.catch(err => console.error("Mongo connection error:", err));

app.get("/", (req, res) => {
    res.send("Server Alive");
});

// User Model
const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    name_recorded: { type: Boolean, default: false },
    registeredAt: { type: Date, default: Date.now }
});

// Ride Model
const rideSchema = new mongoose.Schema({
    type: { type: String, enum: ['driver', 'passenger'], required: true },
    driver_phone: { type: String, required: true },
    direction: { type: String, required: true },
    time: String,
    seats: String,
    note_id: String,
    createdAt: { type: Date, default: Date.now, expires: 10800 }
});

const User = mongoose.model("User", userSchema);
const Ride = mongoose.model("Ride", rideSchema);

app.get("/ivr-api", async (req, res) => {

    const ApiPhone = req.query.ApiPhone || req.query.phone;
    const { ApiDigits, action, r_id, t, d, tm, s } = req.query;

    console.log(`Incoming: action=${action} phone=${ApiPhone} digits=${ApiDigits}`);

    if (!ApiPhone || ApiPhone === "anonymous") {
        return res.send("say=t-שגיאה המערכת לא מזהה את מספר הטלפון שלכם&goto_all_endpoints=exit");
    }

    try {
        let user = await User.findOne({ phone: ApiPhone });

        if (!user) {
            user = await User.create({
                phone: ApiPhone,
                name_recorded: false
            });
        }

        // רישום משתמש
        if (!user.name_recorded && action !== "reg") {
            return res.send(
                `read=t-שלום אינך רשום במערכת הקליטו את שמכם המלא לאחר הצליל וסיימו בסולמית` +
                `=record,no,1,1,7,yes,no&action=reg`
            );
        }

        if (action === "reg") {
            await User.updateOne(
                { phone: ApiPhone },
                { name_recorded: true }
            );

            return res.send(
                `say=t-נרשמתם בהצלחה&go_to=${BASE_URL}?action=main`
            );
        }

        // תפריט ראשי
        if (action === "main" || !action) {
            return res.send(
                `read=t-לנהגים הקישו 1 לנוסעים הקישו 2 למחיקת הפרסומים שלכם הקישו 3` +
                `=digits,1,1,1,7,yes,no&action=h_main`
            );
        }

        if (action === "h_main") {
            if (ApiDigits === "1") return res.send(`go_to=${BASE_URL}?action=d_menu`);
            if (ApiDigits === "2") return res.send(`go_to=${BASE_URL}?action=p_menu`);
            if (ApiDigits === "3") return res.send(`go_to=${BASE_URL}?action=del`);
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        // תפריט נהג
        if (action === "d_menu") {
            return res.send(
                `read=t-לפרסום נסיעה הקישו 1 לשמיעת בקשות של נוסעים הקישו 2` +
                `=digits,1,1,1,7,yes,no&action=h_d_act`
            );
        }

        if (action === "h_d_act") {
            if (ApiDigits === "1") return res.send(`go_to=${BASE_URL}?action=sel_d&t=driver`);
            if (ApiDigits === "2") return res.send(`go_to=${BASE_URL}?action=list&list_t=passenger`);
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        // תפריט נוסע
        if (action === "p_menu") {
            return res.send(
                `read=t-לבקשת נסיעה הקישו 1 לשמיעת נהגים זמינים הקישו 2` +
                `=digits,1,1,1,7,yes,no&action=h_p_act`
            );
        }

        if (action === "h_p_act") {
            if (ApiDigits === "1") return res.send(`go_to=${BASE_URL}?action=sel_d&t=passenger`);
            if (ApiDigits === "2") return res.send(`go_to=${BASE_URL}?action=list&list_t=driver`);
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        // בחירת כיוון
        if (action === "sel_d") {
            return res.send(
                `read=t-מאשדוד לבני ברק הקישו 1 מבני ברק לאשדוד הקישו 2` +
                `=digits,1,1,1,7,yes,no&action=h_dir&t=${t}`
            );
        }

        if (action === "h_dir") {
            if (t === "driver") {
                return res.send(
                    `read=t-הקישו שעת יציאה בארבע ספרות או סולמית ללא שעה` +
                    `=digits,4,1,4,7,yes,no&action=p_tm&t=driver&d=${ApiDigits}`
                );
            } else {
                return res.send(
                    `read=t-להקלטת הערה הקישו 1 או סולמית לסיום` +
                    `=digits,1,1,1,7,yes,no&action=n_st&t=passenger&d=${ApiDigits}`
                );
            }
        }

        // זמן נהג
        if (action === "p_tm") {
            const timeVal = (!ApiDigits || ApiDigits === "none") ? "" : ApiDigits;
            return res.send(
                `read=t-הקישו מספר מקומות פנויים או סולמית` +
                `=digits,1,1,2,7,yes,no&action=p_s&t=driver&d=${d}&tm=${timeVal}`
            );
        }

        if (action === "p_s") {
            const seatsVal = (!ApiDigits || ApiDigits === "none") ? "" : ApiDigits;
            return res.send(
                `read=t-להקלטת הערה קולית הקישו 1 או סולמית` +
                `=digits,1,1,1,7,yes,no&action=n_st&t=driver&d=${d}&tm=${tm}&s=${seatsVal}`
            );
        }

        // הקלטת הערה
        if (action === "n_st") {
            if (ApiDigits === "1") {
                const noteName = `note_${Date.now()}`;
                return res.send(
                    `read=t-הקליטו את ההערה לאחר הצליל וסיימו בסולמית` +
                    `=record,no,1,1,7,yes,no&action=fin&t=${t}&d=${d}&tm=${tm || ""}&s=${s || ""}&n_id=${noteName}`
                );
            }
            return res.send(
                `go_to=${BASE_URL}?action=fin&t=${t}&d=${d}&tm=${tm || ""}&s=${s || ""}`
            );
        }

        // שמירה
        if (action === "fin") {
            await Ride.create({
                type: t,
                driver_phone: ApiPhone,
                direction: d,
                time: tm,
                seats: s,
                note_id: req.query.n_id
            });

            return res.send(
                `say=t-הפרסום נשמר בהצלחה&go_to=${BASE_URL}?action=main`
            );
        }

        // רשימה
        if (action === "list") {
            const listT = req.query.list_t;
            const items = await Ride.find({ type: listT }).sort({ createdAt: -1 });

            if (items.length === 0) {
                return res.send(
                    `say=t-אין כרגע פרסומים בקטגוריה זו&go_to=${BASE_URL}?action=main`
                );
            }

            const item = items[0];
            const dirTxt = item.direction === "1" ? "מאשדוד לבני ברק" : "מבני ברק לאשדוד";
            
            let msg = `t-${dirTxt}. .`;
            if (item.time) msg += `t-בשעה ${item.time}. .`;
            if (item.seats) msg += `t-${item.seats} מקומות פנויים. .`;
            msg += `t-לחיוג למפרסם הקישו 0 לחזרה הקישו 2`;

            return res.send(
                `read=${msg}=digits,1,1,1,7,yes,no&action=opt&r_id=${item._id}`
            );
        }

        if (action === "opt") {
            if (ApiDigits === "0") {
                const item = await Ride.findById(r_id);
                if (item) {
                    return res.send(`api_link=dial&phone=${item.driver_phone}`);
                }
            }
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        // מחיקה
        if (action === "del") {
            const count = await Ride.countDocuments({ driver_phone: ApiPhone });
            if (count === 0) {
                return res.send(
                    `say=t-אין לכם פרסומים פעילים&go_to=${BASE_URL}?action=main`
                );
            }
            return res.send(
                `read=t-נמצאו ${count} פרסומים שלכם למחיקה הקישו 7=digits,1,1,1,7,yes,no&action=h_del`
            );
        }

        if (action === "h_del" && ApiDigits === "7") {
            await Ride.deleteMany({ driver_phone: ApiPhone });
            return res.send(
                `say=t-הפרסומים נמחקו&go_to=${BASE_URL}?action=main`
            );
        }

        return res.send(`go_to=${BASE_URL}?action=main`);

    } catch (err) {
        console.error(err);
        return res.send(`say=t-תקלה זמנית בשרת&goto_all_endpoints=exit`);
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
