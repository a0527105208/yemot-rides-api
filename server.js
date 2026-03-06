const express = require("express");
const app = express();

app.get("/ivr-api",(req,res)=>{
    console.log(req.query);

    res.send(
        "read=t-המערכת פועלת הקישו 1 לבדיקה=digits,1,1,1,7,yes,no&action=test"
    );
});

app.listen(3000,()=>{
    console.log("server started");
});
