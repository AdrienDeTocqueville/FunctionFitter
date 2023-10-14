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
        div.innerHTML = `<i class="fa ${icons[type]}" style="color: ${colors[type]}; padding-right: 10px"></i> ${txt}`;

        add_list_element('#console_list', "display: flex; flex-direction: row", [div], (li) => {
            li.remove();
            if (document.querySelector("#console_list").childElementCount == 0)
                Console.pannel.style.display = "none";
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
}
