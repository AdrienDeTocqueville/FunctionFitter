class Console
{
    static pannel = document.querySelector("#console");

    static messages = [];

    static build_msg(txt, type)
    {
        let icons = {
            info: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            error: 'fa-bug',
        };
        let colors = {
            info: 'grey',
            warning: 'orange',
            error: 'red',
        };
        let badge_style = "display: none; background-color: grey; margin-left: auto; height: fit-content"

        let div = document.createElement("div");
        div.style = "display: flex; align-items: center; width: 100%";
        div.innerHTML = `<i class="fa ${icons[type]}" style="color: ${colors[type]}; padding-right: 10px"></i>`
                      + `<div>${txt}</div>`
                      + `<span style="${badge_style}" class="badge badge-light"></span>`;

        return div;
    }

    static print(txt, type, id)
    {
        // Find duplicates
        for (let msg of Console.messages)
        {
            if (msg.type == type && msg.id == id && msg.txt == txt)
            {
                msg.count++;

                let count = msg.li.children[0].children[2];
                count.style.display = "block";
                count.innerHTML = msg.count;
                return;
            }
        }

        // Add new
        let div = Console.build_msg(txt, type);
        let li = add_list_element('#console_list', "display: flex; flex-direction: row", [div], Console.remove_msg);

        Console.messages.push({ li, txt, type, id, count: 1 });
        Console.pannel.style.display = "block";
    }

    static log(txt, id)
    {
        Console.print(txt, 'info', id);
    }

    static warning(txt, id)
    {
        Console.print(txt, 'warning', id);
    }

    static error(txt, id)
    {
        Console.print(txt, 'error', id);
    }

    static close()
    {
        Console.pannel.style.display = "none";
    }

    static remove_msg(li)
    {
        for (let i = 0; i < Console.messages.length; i++)
        {
            if (Console.messages[i].li == li)
            {
                Console.messages.splice(i, 1);
                li.remove();
                break;
            }
        }

        if (document.querySelector("#console_list").childElementCount == 0)
            Console.close();
    }

    static clear(id)
    {
        if (id != undefined)
        {
            Console.messages = Console.messages.filter((msg) => {
                if (msg.id == id)
                {
                    msg.li.remove();
                    return false;
                }
                return true;
            });

            if (document.querySelector("#console_list").childElementCount == 0)
                Console.close();
        }
        else
        {
            Console.messages = [];
            document.querySelector('#console_list').innerHTML = "";
            Console.close();
        }
    }
}

document.querySelector("#close_console").onclick = () => Console.clear();
