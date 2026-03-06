const express = require('express');
const mongoose = require('mongoose');
const app = express();
const port = process.env.PORT || 3000;

/**
 * התחברות למסד הנתונים MongoDB Atlas
 * וודא שהחלפת את <password> ו-<username> בפרטים שלך מ-Atlas
 */
const mongoURI = process.env.MONGO_URI || 'mongodb+srv://<username>:<password>@cluster0.xxxx.mongodb.net/rides_db?retryWrites=true&w=majority';

mongoose.connect(mongoURI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));

// מודל משתמש - המזהה הוא מספר הטלפון
const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    name_recorded: { type: Boolean, default: false },
    registeredAt: { type: Date, default: Date.now }
});

// מודל נסיעה - כולל מחיקה אוטומטית אחרי 3 שעות
const rideSchema = new mongoose.Schema({
    driver_phone: { type: String, required: true },
    direction: { type: String, required: true }, // '1' - לירושלים, '2' - לבני ברק
    time: String, // שעה ב-4 ספרות
    seats: String, // מספר מקומות
    createdAt: { type: Date, default: Date.now, expires: 10800 } // 10800 שניות = 3 שעות
});

const User = mongoose.model('User', userSchema);
const Ride = mongoose.model('Ride', rideSchema);

app.get('/ivr-api', async (req, res) => {
    const { ApiPhone, ApiControl, ApiDigits, action, ride_id } = req.query;

    try {
        // 1. זיהוי או רישום אוטומטי לפי מספר טלפון
        let user = await User.findOne({ phone: ApiPhone });
        
        if (!user) {
            await User.create({ phone: ApiPhone });
            // שליחה להקלטת שם פעם אחת בלבד - הקובץ נשמר בתיקיית השמות של המערכת
            return res.send(`read=t-שלום, אינך רשום במערכת. אנא הקליטו את שמכם המלא לאחר הצליל וסיימו בסולמית=record_name,no,1,1,7,yes,no&next=main_menu`);
        }

        // 2. תפריט ראשי
        if (ApiControl === 'main_menu' || !action) {
            return res.send(`read=t-לפרסום נסיעה הקישו 1, לשמיעת נסיעות הקישו 2, לניהול הנסיעות שלי הקישו 3=digits,1,1,1,7,yes,no&action=handle_main`);
        }

        // 3. לוגיקת תפריט ראשי
        if (action === 'handle_main') {
            if (ApiDigits === '1') {
                return res.send(`read=t-לבחירת כיוון: לירושלים הקישו 1, לבני ברק הקישו 2=digits,1,1,1,7,yes,no&action=post_direction`);
            }
            if (ApiDigits === '2') {
                return res.send(`routing=list_rides_start`);
            }
            if (ApiDigits === '3') {
                const myRides = await Ride.find({ driver_phone: ApiPhone });
                if (myRides.length === 0) return res.send(`id_list_message=t-אין לך נסיעות פעילות כרגע.&routing=main_menu`);
                return res.send(`read=t-למחיקת כל הנסיעות שלך הקישו 7=digits,1,1,1,7,yes,no&action=delete_my_rides`);
            }
        }

        // 4. תהליך פרסום נסיעה
        if (action === 'post_direction') {
            return res.send(`read=t-הקישו שעת יציאה ב-4 ספרות, או סולמית לדילוג=digits,4,1,4,7,yes,no&action=post_time&direction=${ApiDigits}`);
        }
        if (action === 'post_time') {
            return res.send(`read=t-הקישו מספר מקומות פנויים, או סולמית לדילוג=digits,1,1,2,7,yes,no&action=post_finalize&direction=${req.query.direction}&time=${ApiDigits}`);
        }
        if (action === 'post_finalize') {
            await Ride.create({
                driver_phone: ApiPhone,
                direction: req.query.direction,
                time: req.query.time === 'none' ? '' : req.query.time,
                seats: ApiDigits === 'none' ? '' : ApiDigits
            });
            return res.send(`id_list_message=t-הנסיעה פורסמה בהצלחה.&routing=main_menu`);
        }

        // 5. השמעת נסיעות (כאן הוספנו את השמעת השם)
        if (action === 'list_rides_start') {
            const rides = await Ride.find().sort({ createdAt: -1 });
            if (rides.length === 0) return res.send(`id_list_message=t-אין נסיעות פעילות כרגע.&routing=main_menu`);
            
            const r = rides[0];
            const directionText = r.direction === '1' ? 'לירושלים' : 'לבני ברק';
            
            /**
             * יצירת הודעה שמשלבת טקסט וקובץ שמע.
             * אנחנו מניחים שקובץ השם נשמר תחת מספר הטלפון בתיקיית השמות של ימות המשיח.
             * אם הקובץ לא קיים, המערכת פשוט תמשיך הלאה.
             */
            let message = `t-נסיעה ${directionText}. .`;
            message += `t-מאת. .`;
            message += `f-NameIndex/${r.driver_phone}. .`; // השמעת קובץ השם מתיקיית השמות
            message += `t-בשעה ${r.time || 'לא צוינה'}. .`;
            message += `t-לחיוג לנהג הקישו 0, לחזרה לתפריט הקישו 2`;

            return res.send(`read=${message}=digits,1,1,1,7,yes,no&action=ride_options&ride_id=${r._id}`);
        }

        // 6. אפשרויות בזמן האזנה לנסיעה
        if (action === 'ride_options') {
            if (ApiDigits === '0') {
                const ride = await Ride.findById(ride_id);
                if (!ride) return res.send(`id_list_message=t-מצטערים, הנסיעה כבר אינה רלוונטית.&routing=main_menu`);
                return res.send(`api_link=dial&phone=${ride.driver_phone}`);
            }
            return res.send(`routing=main_menu`);
        }

        // 7. מחיקה יזומה
        if (action === 'delete_my_rides' && ApiDigits === '7') {
            await Ride.deleteMany({ driver_phone: ApiPhone });
            return res.send(`id_list_message=t-כל הנסיעות שלך נמחקו בהצלחה.&routing=main_menu`);
        }

    } catch (error) {
        console.error("Database Error:", error);
        res.send(`id_list_message=t-חלה תקלה זמנית בחיבור למסד הנתונים.&goto_all_endpoints=exit`);
    }
});

app.listen(port, () => console.log(`Server is running on port ${port}`));