function myFunctionLife(param)
{
    if(param==null)
    {
        life = 3;
    }
    else
    {
        life = 3-param;
    }
    
    console.log(life);
    var life0 = ["emptylove.png","emptylove.png","emptylove.png"];
    var life1 = ["fulllove.png","emptylove.png","emptylove.png"];
    var life2 = ["fulllove.png","fulllove.png","emptylove.png"];
    var life3 = ["fulllove.png","fulllove.png","fulllove.png"];
    var i;
    var templife="";
    for(i = 0;i<3;i++)
    {
        if(life==0)
        {
            templife += "<img src='images/"+life0[i]+"'"+">"+"  ";
        }
        else if(life == 1)
        {
            templife += "<img src='images/"+life1[i]+"'"+">"+"  ";
        }
        else if(life==2)
        {
            templife += "<img src='images/"+life2[i]+"'"+">"+"  ";
        }
        else if(life==3)
        {
            templife += "<img src='images/"+life3[i]+"'"+">"+"  ";
        }

    }
    document.getElementById("life").innerHTML = templife;
}