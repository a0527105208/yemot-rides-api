const express = require("express");
const app = express();
const port = process.env.PORT || 3000;

app.get("/ivr-api", (req,res)=>{
    const phone = req.query.ApiPhone || req.query.phone;

    if(!phone || phone==="anonymous"){
        return res.send("say=t-לא ניתן לזהות את מספר הטלפון&goto_all_endpoints=exit");
    }

    // שלב הקלטת שם
    return res.send(
        `say=t-שלום! הקליטו את שמכם לאחר הצליל וסיימו בסולמית`+
        `&record=name_${phone},1,10,no,no`+
        `&go_to=https://yemot-rides.onrender.com/ivr-api?action=main`
    );
});

app.listen(port, ()=>{
    console.log("Server running on port", port);
});
