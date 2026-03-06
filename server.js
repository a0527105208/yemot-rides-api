const express = require('express');
const mongoose = require('mongoose');
const app = express();
const port = process.env.PORT || 3000;

// הכתובת המלאה של השרת שלך ב-Render - חיוני לניתוב תקין
const BASE_URL = "https://yemot-rides.onrender.com/ivr-api";
const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));

// User Model
const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    name_recorded: { type: Boolean, default: false },
    registeredAt: { type: Date, default: Date.now }
});

// Ride/Request Model
const rideSchema = new mongoose.Schema({
    type: { type: String, enum: ['driver', 'passenger'], required: true },
    driver_phone: { type: String, required: true },
    direction: { type: String, required: true }, // 1: Ashdod to Bney Brak, 2: Bney Brak to Ashdod
    time: String,
    seats: String,
    note_id: String,
    createdAt: { type: Date, default: Date.now, expires: 10800 } 
});

const User = mongoose.model('User', userSchema);
const Ride = mongoose.model('Ride', rideSchema);

app.get('/ivr-api', async (req, res) => {
    const { ApiPhone, ApiDigits, action, r_id, t, d, tm, s } = req.query;

    if (!ApiPhone) return res.send('hangup');

    try {
        let user = await User.findOne({ phone: ApiPhone });
        if (!user) {
            user = await User.create({ phone: ApiPhone, name_recorded: false });
        }

        // Initial Registration
        if (!user.name_recorded && action !== 'reg') {
            return res.send(`read=t-שלום אינך רשום במערכת אנא הקליטו את שמכם המלא לאחר הצליל וסיימו בסולמית=record_name,no,1,1,7,yes,no&action=reg`);
        }
        
        if (action === 'reg') {
            await User.updateOne({ phone: ApiPhone }, { name_recorded: true });
            return res.send(`say=t-נשמר&go_to=${BASE_URL}?action=main`);
        }

        // Main Menu
        if (action === 'main' || !action) {
            return res.send(`read=t-לנהגים הקישו 1 לנוסעים הקישו 2 למחיקה הקישו 3=digits,1,1,1,7,yes,no&action=h_main`);
        }

        if (action === 'h_main') {
            if (ApiDigits === '1') return res.send(`go_to=${BASE_URL}?action=d_menu`);
            if (ApiDigits === '2') return res.send(`go_to=${BASE_URL}?action=p_menu`);
            if (ApiDigits === '3') return res.send(`go_to=${BASE_URL}?action=del`);
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        // Driver Menu
        if (action === 'd_menu') {
            return res.send(`read=t-לפרסום נסיעה הקישו 1 לשמיעת בקשות הקישו 2=digits,1,1,1,7,yes,no&action=h_d_act`);
        }
        if (action === 'h_d_act') {
            if (ApiDigits === '1') return res.send(`go_to=${BASE_URL}?action=sel_d&t=driver`);
            if (ApiDigits === '2') return res.send(`go_to=${BASE_URL}?action=list&list_t=passenger`);
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        // Passenger Menu
        if (action === 'p_menu') {
            return res.send(`read=t-לבקשת נסיעה הקישו 1 לשמיעת נהגים הקישו 2=digits,1,1,1,7,yes,no&action=h_p_act`);
        }
        if (action === 'h_p_act') {
            if (ApiDigits === '1') return res.send(`go_to=${BASE_URL}?action=sel_d&t=passenger`);
            if (ApiDigits === '2') return res.send(`go_to=${BASE_URL}?action=list&list_t=driver`);
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        // Direction Selection
        if (action === 'sel_d') {
            return res.send(`read=t-מאשדוד לבני ברק הקישו 1 מבני ברק לאשדוד הקישו 2=digits,1,1,1,7,yes,no&action=h_dir&t=${t}`);
        }
        if (action === 'h_dir') {
            if (t === 'driver') {
                return res.send(`read=t-הקישו שעת יציאה ב-4 ספרות או סולמית=digits,4,1,4,7,yes,no&action=p_tm&t=driver&d=${ApiDigits}`);
            } else {
                return res.send(`read=t-להקלטת הערה הקישו 1 או סולמית=digits,1,1,1,7,yes,no&action=n_st&t=passenger&d=${ApiDigits}`);
            }
        }

        // Driver details
        if (action === 'p_tm') {
            const timeVal = (ApiDigits === 'none' || !ApiDigits) ? '' : ApiDigits;
            return res.send(`read=t-הקישו מספר מקומות או סולמית=digits,1,1,2,7,yes,no&action=p_s&t=driver&d=${d}&tm=${timeVal}`);
        }
        if (action === 'p_s') {
            const seatsVal = (ApiDigits === 'none' || !ApiDigits) ? '' : ApiDigits;
            return res.send(`read=t-להקלטת הערה הקישו 1 או סולמית=digits,1,1,1,7,yes,no&action=n_st&t=driver&d=${d}&tm=${tm}&s=${seatsVal}`);
        }

        // Note Recording
        if (action === 'n_st') {
            if (ApiDigits === '1') {
                const noteName = `n_${Date.now()}`;
                return res.send(`read=t-הקליטו הערה וסיימו בסולמית=record_name,no,1,1,7,yes,no&action=fin&t=${t}&d=${d}&tm=${tm || ''}&s=${s || ''}&n_id=${noteName}`);
            }
            return res.send(`go_to=${BASE_URL}?action=fin&t=${t}&d=${d}&tm=${tm || ''}&s=${s || ''}`);
        }

        // Finalize
        if (action === 'fin') {
            await Ride.create({
                type: t,
                driver_phone: ApiPhone,
                direction: d,
                time: tm,
                seats: s,
                note_id: req.query.n_id
            });
            return res.send(`say=t-נשמר בהצלחה&go_to=${BASE_URL}?action=main`);
        }

        // Listing
        if (action === 'list') {
            const listT = req.query.list_t;
            const items = await Ride.find({ type: listT }).sort({ createdAt: -1 });
            if (items.length === 0) return res.send(`say=t-אין פרסומים&go_to=${BASE_URL}?action=main`);
            
            const item = items[0]; 
            const dirTxt = item.direction === '1' ? 'מאשדוד לבני ברק' : 'מבני ברק לאשדוד';
            const roleTxt = item.type === 'driver' ? 'נהג' : 'נוסע';
            
            let msg = `t-${roleTxt} ${dirTxt}. .`;
            msg += `t-מאת. .f-NameIndex/${item.driver_phone}. .`;
            if (item.time) msg += `t-בשעה ${item.time}. .`;
            if (item.seats) msg += `t-עם ${item.seats} מקומות. .`;
            if (item.note_id) msg += `t-הערה. .f-NameIndex/${item.note_id}. .`;
            msg += `t-לחיוג הקישו 0 לחזרה הקישו 2`;

            return res.send(`read=${msg}=digits,1,1,1,7,yes,no&action=opt&r_id=${item._id}`);
        }

        if (action === 'opt') {
            if (ApiDigits === '0') {
                const item = await Ride.findById(r_id);
                if (item) return res.send(`api_link=dial&phone=${item.driver_phone}`);
            }
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        // Delete
        if (action === 'del') {
            const count = await Ride.countDocuments({ driver_phone: ApiPhone });
            if (count === 0) return res.send(`say=t-אין פרסומים&go_to=${BASE_URL}?action=main`);
            return res.send(`read=t-למחיקת ${count} פרסומים הקישו 7=digits,1,1,1,7,yes,no&action=h_del`);
        }
        if (action === 'h_del' && ApiDigits === '7') {
            await Ride.deleteMany({ driver_phone: ApiPhone });
            return res.send(`say=t-נמחק&go_to=${BASE_URL}?action=main`);
        }
        if (action === 'h_del') return res.send(`go_to=${BASE_URL}?action=main`);

    } catch (error) {
        console.error("Error:", error);
        res.send(`say=t-תקלה&goto_all_endpoints=exit`);
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
