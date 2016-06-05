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
            location.href="gameover.html";
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

function False()
    {
        count++;
        console.log("count "+count);
        if(count==1)
        {
            life = 1;
            myFunctionLife(life);
        }
        else if(count==2)
        {
            life=2;
            myFunctionLife(life);
        }
        else if(count==3)
        {
            life=3;
            myFunctionLife(life);
        }
        else if(count ==4)
        {
            life = 0;
             myFunctionLife(life);
        }

    }

function Joke()
{
    document.getElementById("input")
    .addEventListener("keyup", function(event) {
    event.preventDefault();
    if (event.keyCode == 13) {
        document.getElementById("input").click();
        location.href="joke.html";
    }
});
}