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
.then(()=>console.log("Mongo connected"))
.catch(err=>console.log(err));

/* ---------------- Models ---------------- */

const userSchema = new mongoose.Schema({
    phone: {type:String, required:true, unique:true},
    name_recorded: {type:Boolean, default:false},
    createdAt: {type:Date, default:Date.now}
});

const rideSchema = new mongoose.Schema({
    type: {type:String, enum:["driver","passenger"], required:true},
    driver_phone: {type:String, required:true},
    direction: String,
    time: String,
    seats: String,
    note_id: String,
    createdAt: {type:Date, default:Date.now, expires:10800}
});

const User = mongoose.model("User",userSchema);
const Ride = mongoose.model("Ride",rideSchema);

/* ---------------- IVR ---------------- */

app.get("/ivr-api", async (req,res)=>{

    const ApiPhone = req.query.ApiPhone || req.query.phone;
    const {ApiDigits, action, t, d, tm, s, r_id} = req.query;

    console.log("REQ:", req.query);

    if(!ApiPhone || ApiPhone==="anonymous"){
        return res.send("say=t-לא ניתן לזהות את מספר הטלפון&goto_all_endpoints=exit");
    }

    try{

        let user = await User.findOne({phone: ApiPhone});
        if(!user){
            user = await User.create({phone: ApiPhone});
        }

        /* ---------- הקלטת שם ---------- */
        if(!user.name_recorded && action!=="reg"){
            const recName = `name_${ApiPhone}`;

            return res.send(
                `say=t-שלום! הקליטו את שמכם לאחר הצליל וסיימו בסולמית`+
                `&record=${recName},1,10,no,no`+
                `&go_to=${BASE_URL}?action=reg`
            );
        }

        if(action==="reg"){
            await User.updateOne({phone: ApiPhone}, {name_recorded:true});
            return res.send(`say=t-ההרשמה הושלמה&go_to=${BASE_URL}?action=main`);
        }

        /* ---------- תפריט ראשי ---------- */
        if(!action || action==="main"){
            return res.send(
                `read=t-לנהגים הקישו 1 לנוסעים הקישו 2 למחיקת פרסומים הקישו 3`+
                `=digits,1,1,1,7,yes,no&action=h_main`
            );
        }

        if(action==="h_main"){
            if(ApiDigits==="1") return res.send(`go_to=${BASE_URL}?action=d_menu`);
            if(ApiDigits==="2") return res.send(`go_to=${BASE_URL}?action=p_menu`);
            if(ApiDigits==="3") return res.send(`go_to=${BASE_URL}?action=del`);
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        /* ---------- נהג ---------- */
        if(action==="d_menu"){
            return res.send(
                `read=t-לפרסום נסיעה הקישו 1 לשמיעת בקשות נוסעים הקישו 2`+
                `=digits,1,1,1,7,yes,no&action=h_d`
            );
        }

        if(action==="h_d"){
            if(ApiDigits==="1") return res.send(`go_to=${BASE_URL}?action=sel_dir&t=driver`);
            if(ApiDigits==="2") return res.send(`go_to=${BASE_URL}?action=list&list_t=passenger`);
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        /* ---------- נוסע ---------- */
        if(action==="p_menu"){
            return res.send(
                `read=t-לבקשת נסיעה הקישו 1 לשמיעת נהגים הקישו 2`+
                `=digits,1,1,1,7,yes,no&action=h_p`
            );
        }

        if(action==="h_p"){
            if(ApiDigits==="1") return res.send(`go_to=${BASE_URL}?action=sel_dir&t=passenger`);
            if(ApiDigits==="2") return res.send(`go_to=${BASE_URL}?action=list&list_t=driver`);
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        /* ---------- בחירת כיוון ---------- */
        if(action==="sel_dir"){
            return res.send(
                `read=t-מאשדוד לבני ברק הקישו 1 מבני ברק לאשדוד הקישו 2`+
                `=digits,1,1,1,7,yes,no&action=h_dir&t=${t}`
            );
        }

        if(action==="h_dir"){
            if(t==="driver"){
                return res.send(
                    `read=t-הקישו שעת יציאה בארבע ספרות`+
                    `=digits,4,1,4,7,yes,no&action=set_time&t=${t}&d=${ApiDigits}`
                );
            }
            return res.send(`go_to=${BASE_URL}?action=finish&t=${t}&d=${ApiDigits}`);
        }

        if(action==="set_time"){
            return res.send(
                `read=t-הקישו מספר מקומות פנויים`+
                `=digits,1,1,2,7,yes,no&action=finish&t=${t}&d=${d}&tm=${ApiDigits}`
            );
        }

        /* ---------- שמירה ---------- */
        if(action==="finish"){
            await Ride.create({
                type:t,
                driver_phone:ApiPhone,
                direction:d,
                time:tm,
                seats:ApiDigits
            });
            return res.send(`say=t-הפרסום נשמר בהצלחה&go_to=${BASE_URL}?action=main`);
        }

        /* ---------- רשימה ---------- */
        if(action==="list"){
            const listT = req.query.list_t;
            const items = await Ride.find({type:listT}).sort({createdAt:-1}).limit(1);
            if(items.length===0) return res.send(`say=t-אין כרגע פרסומים&go_to=${BASE_URL}?action=main`);
            const item = items[0];
            let msg = "t-פרסום נסיעה. .";
            if(item.time) msg+=`t-בשעה ${item.time}. .`;
            if(item.seats) msg+=`t-${item.seats} מקומות פנויים. .`;
            msg+="t-לחיוג הקישו 0 לחזרה הקישו 2";
            return res.send(`read=${msg}=digits,1,1,1,7,yes,no&action=list_opt&r_id=${item._id}`);
        }

        if(action==="list_opt"){
            if(ApiDigits==="0"){
                const ride = await Ride.findById(r_id);
                if(ride) return res.send(`dial=${ride.driver_phone}`);
            }
            return res.send(`go_to=${BASE_URL}?action=main`);
        }

        /* ---------- מחיקה ---------- */
        if(action==="del"){
            const count = await Ride.countDocuments({driver_phone:ApiPhone});
            if(count===0) return res.send(`say=t-אין לכם פרסומים פעילים&go_to=${BASE_URL}?action=main`);
            return res.send(`read=t-נמצאו ${count} פרסומים למחיקה הקישו 7=digits,1,1,1,7,yes,no&action=del_ok`);
        }

        if(action==="del_ok" && ApiDigits==="7"){
            await Ride.deleteMany({driver_phone:ApiPhone});
            return res.send(`say=t-הפרסומים נמחקו&go_to=${BASE_URL}?action=main`);
        }

        return res.send(`go_to=${BASE_URL}?action=main`);

    }catch(err){
        console.log(err);
        return res.send(`say=t-תקלה זמנית במערכת&goto_all_endpoints=exit`);
    }

});

app.listen(port, ()=>{ console.log("Server running on port", port); });
