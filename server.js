const express = require('express');
const mongoose = require('mongoose');
const app = express();
const port = process.env.PORT || 3000;

const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));

// מודל משתמש
const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    name_recorded: { type: Boolean, default: false },
    registeredAt: { type: Date, default: Date.now }
});

// מודל נסיעה/בקשה
const rideSchema = new mongoose.Schema({
    type: { type: String, enum: ['driver', 'passenger'], required: true },
    driver_phone: { type: String, required: true },
    direction: { type: String, required: true }, // 1: אשדוד לב"ב, 2: ב"ב לאשדוד
    time: String,
    seats: String,
    note_id: String, // מזהה הקלטת ההערה
    createdAt: { type: Date, default: Date.now, expires: 10800 } // מחיקה אוטומטית אחרי 3 שעות
});

const User = mongoose.model('User', userSchema);
const Ride = mongoose.model('Ride', rideSchema);

app.get('/ivr-api', async (req, res) => {
    const { ApiPhone, ApiControl, ApiDigits, action, ride_id, type, direction, time, seats } = req.query;

    try {
        let user = await User.findOne({ phone: ApiPhone });
        if (!user) {
            user = await User.create({ phone: ApiPhone, name_recorded: false });
        }

        // שלב הקלטת שם ראשוני
        if (!user.name_recorded && action !== 'after_record') {
            return res.send(`read=t-שלום, אינך רשום במערכת. אנא הקליטו את שמכם המלא לאחר הצליל וסיימו בסולמית=record_name,no,1,1,7,yes,no&action=after_record`);
        }
        
        if (action === 'after_record') {
            await User.updateOne({ phone: ApiPhone }, { name_recorded: true });
            return res.send(`id_list_message=t-השם נשמר בהצלחה.&go_to=ivr-api?action=main_menu`);
        }

        // תפריט ראשי
        if (action === 'main_menu' || !action) {
            return res.send(`read=t-לנהגים הקישו 1, לנוסעים הקישו 2, למחיקת הפרסומים שלי הקישו 3=digits,1,1,1,7,yes,no&action=handle_main`);
        }

        // ניתוב תפריט ראשי
        if (action === 'handle_main') {
            if (ApiDigits === '1') return res.send(`go_to=ivr-api?action=driver_menu`);
            if (ApiDigits === '2') return res.send(`go_to=ivr-api?action=passenger_menu`);
            if (ApiDigits === '3') return res.send(`go_to=ivr-api?action=delete_menu`);
            return res.send(`go_to=ivr-api?action=main_menu`);
        }

        // תפריט נהגים
        if (action === 'driver_menu') {
            return res.send(`read=t-לפרסום נסיעה הקישו 1, לשמיעת בקשות נסיעה הקישו 2=digits,1,1,1,7,yes,no&action=driver_action`);
        }
        if (action === 'driver_action') {
            if (ApiDigits === '1') return res.send(`go_to=ivr-api?action=select_direction&type=driver`);
            if (ApiDigits === '2') return res.send(`go_to=ivr-api?action=list_items&list_type=passenger`);
            return res.send(`go_to=ivr-api?action=main_menu`);
        }

        // תפריט נוסעים
        if (action === 'passenger_menu') {
            return res.send(`read=t-לבקשת נסיעה הקישו 1, לשמיעת נהגים הקישו 2=digits,1,1,1,7,yes,no&action=passenger_action`);
        }
        if (action === 'passenger_action') {
            if (ApiDigits === '1') return res.send(`go_to=ivr-api?action=select_direction&type=passenger`);
            if (ApiDigits === '2') return res.send(`go_to=ivr-api?action=list_items&list_type=driver`);
            return res.send(`go_to=ivr-api?action=main_menu`);
        }

        // בחירת כיוון (משותף)
        if (action === 'select_direction') {
            return res.send(`read=t-לבחירת כיוון: מאשדוד לבני ברק הקישו 1, מבני ברק לאשדוד הקישו 2=digits,1,1,1,7,yes,no&action=handle_direction&type=${type}`);
        }
        if (action === 'handle_direction') {
            if (type === 'driver') {
                return res.send(`read=t-הקישו שעת יציאה ב-4 ספרות, או סולמית לדילוג=digits,4,1,4,7,yes,no&action=post_time&type=driver&direction=${ApiDigits}`);
            } else {
                return res.send(`read=t-להקלטת הערה לבקשה הקישו 1, או סולמית לדילוג=digits,1,1,1,7,yes,no&action=record_note_start&type=passenger&direction=${ApiDigits}`);
            }
        }

        // שעה ומושבים לנהג
        if (action === 'post_time') {
            const timeVal = (ApiDigits === 'none' || !ApiDigits) ? '' : ApiDigits;
            return res.send(`read=t-הקישו מספר מקומות פנויים, או סולמית לדילוג=digits,1,1,2,7,yes,no&action=post_seats&type=driver&direction=${direction}&time=${timeVal}`);
        }
        if (action === 'post_seats') {
            const seatsVal = (ApiDigits === 'none' || !ApiDigits) ? '' : ApiDigits;
            return res.send(`read=t-להקלטת הערה לנסיעה הקישו 1, או סולמית לדילוג=digits,1,1,1,7,yes,no&action=record_note_start&type=driver&direction=${direction}&time=${time}&seats=${seatsVal}`);
        }

        // הקלטת הערה (משותף)
        if (action === 'record_note_start') {
            if (ApiDigits === '1') {
                const noteName = `note_${Date.now()}_${ApiPhone}`;
                return res.send(`read=t-אנא הקליטו את הערתכם לאחר הצליל וסיימו בסולמית=record_name,no,1,1,7,yes,no&action=finalize_post&type=${type}&direction=${direction}&time=${time || ''}&seats=${seats || ''}&note_id=${noteName}`);
            }
            return res.send(`go_to=ivr-api?action=finalize_post&type=${type}&direction=${direction}&time=${time || ''}&seats=${seats || ''}`);
        }

        // שמירה סופית
        if (action === 'finalize_post') {
            await Ride.create({
                type: type,
                driver_phone: ApiPhone,
                direction: direction,
                time: time,
                seats: seats,
                note_id: req.query.note_id
            });
            return res.send(`id_list_message=t-הפרסום נשמר בהצלחה.&go_to=ivr-api?action=main_menu`);
        }

        // השמעת רשימות
        if (action === 'list_items') {
            const listType = req.query.list_type;
            const items = await Ride.find({ type: listType }).sort({ createdAt: -1 });
            if (items.length === 0) return res.send(`id_list_message=t-אין פרסומים רלוונטיים כרגע.&go_to=ivr-api?action=main_menu`);
            
            const item = items[0]; 
            const dirText = item.direction === '1' ? 'מאשדוד לבני ברק' : 'מבני ברק לאשדוד';
            const roleText = item.type === 'driver' ? 'נהג' : 'נוסע';
            
            let msg = `t-${roleText} ${dirText}. .`;
            msg += `t-מאת. .f-NameIndex/${item.driver_phone}. .`;
            if (item.time) msg += `t-בשעה ${item.time}. .`;
            if (item.seats) msg += `t-עם ${item.seats} מקומות. .`;
            if (item.note_id) msg += `t-הערה. .f-NameIndex/${item.note_id}. .`;
            msg += `t-לחיוג הקישו 0, לחזרה הקישו 2`;

            return res.send(`read=${msg}=digits,1,1,1,7,yes,no&action=item_options&item_id=${item._id}`);
        }

        if (action === 'item_options') {
            if (ApiDigits === '0') {
                const item = await Ride.findById(req.query.item_id);
                if (item) return res.send(`api_link=dial&phone=${item.driver_phone}`);
            }
            return res.send(`go_to=ivr-api?action=main_menu`);
        }

        // מחיקת הודעות שלי
        if (action === 'delete_menu') {
            const count = await Ride.countDocuments({ driver_phone: ApiPhone });
            if (count === 0) return res.send(`id_list_message=t-אין לך פרסומים פעילים.&go_to=ivr-api?action=main_menu`);
            return res.send(`read=t-יש לך ${count} פרסומים פעילים. למחיקת כולם הקישו 7, לביטול הקישו כל מקש אחר=digits,1,1,1,7,yes,no&action=handle_delete`);
        }
        if (action === 'handle_delete' && ApiDigits === '7') {
            await Ride.deleteMany({ driver_phone: ApiPhone });
            return res.send(`id_list_message=t-כל הפרסומים שלך נמחקו.&go_to=ivr-api?action=main_menu`);
        }
        
        if (action === 'handle_delete') {
             return res.send(`go_to=ivr-api?action=main_menu`);
        }

    } catch (error) {
        console.error("Error:", error);
        res.send(`id_list_message=t-חלה תקלה זמנית.&goto_all_endpoints=exit`);
    }
});

app.listen(port, () => console.log(`Server is running on port ${port}`));
