class Console
{
    static pannel = document.querySelector("#console");

    static print(txt, type)
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
        let div = document.createElement("div");
        div.style = "display: flex; align-items: center";
        div.innerHTML = `<i class="fa ${icons[type]}" style="color: ${colors[type]}; padding-right: 10px"></i> <div>${txt}</div>`;

        add_list_element('#console_list', "display: flex; flex-direction: row", [div], (li) => {
            li.remove();
            if (document.querySelector("#console_list").childElementCount == 0)
                Console.close();
        });
        
        Console.pannel.style.display = "block";
    }

    static log(txt)
    {
        Console.print(txt, 'info');
    }

    static warning(txt)
    {
        Console.print(txt, 'warning');
    }

    static error(txt)
    {
        Console.print(txt, 'error');
    }

    static close()
    {
        Console.pannel.style.display = "none";
    }

    static clear()
    {
        document.querySelector('#console_list').innerHTML = "";
        Console.close();
    }
}

document.querySelector("#close_console").onclick = () => Console.clear();
