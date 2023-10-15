class Setting
{
    static instances = {};

    constructor(name, type, initial_value, settings = {}, refresh_ui = true)
    {
        if (window[name] != undefined)
            return;

        this.name = name;
        this.type = type;
        this.settings = {...settings};
        this.set_value(initial_value);

        Setting.instances[name] = this;

        if (refresh_ui) this.display();
    }

    display()
    {
        let settings = {
            label: this.name,
            id: "settings-" + this.name,

            min: this.settings.min,
            max: this.settings.max,
        };

        let [input, label] = create_input(this.type, this.value, settings, (value) => {
            this.set_value(value);
            Plot.repaint();
        });

        label.style = "margin-right: 30px";
        add_list_element('#settings_list', "display: flex; flex-direction: row", [label, input]);
    }

    set_value(value)
    {
        if (this.type == "range")
            value = clamp(value, this.settings.min, this.settings.max);

        window[this.name] = value;
        this.value = value;
    }

    set_type(type)
    {
        let allowed = ["checkbox", "number", "text", "range", "lut"];
        if (!allowed.includes(type))
        {
            Console.error("Unknown settings type: " + type);
            return;
        }

        this.type = type;
        if (type == "range")
        {
            if (this.settings.min == undefined) this.settings.min = 0;
            if (this.settings.max == undefined) this.settings.max = 1;
            this.set_value(this.value); // clamp
        }
    }

    static edit()
    {
        let content = document.createElement("ul");
        content.style = "width: 600px";

        let build_settings = () => {
            content.innerHTML = "";

            for (let name in Setting.instances)
            {
                let src = Setting.instances[name];

                let type_settings = {
                    label: name,

                    values: ["number", "range", "checkbox", "LUT (todo)"],
                    width: '150px',
                };
                var [type, label] = create_input('dropdown', src.type, type_settings, (new_type) => {
                    src.set_type(new_type)
                    build_settings();
                });

                let settings;
                if (src.type == "range")
                {
                    let form = Setting.build_slider_form(name, src.settings.min, src.settings.max);
                    form[0].onchange = (e) => { src.settings.min = min(e.target.valueAsNumber, src.settings.max); }
                    form[1].onchange = (e) => { src.settings.max = max(e.target.valueAsNumber, src.settings.min); }

                    settings = wrap(form);
                }

                add_list_element(content, "display: flex; flex-direction: row", [label, type, settings], (li) => {
                    delete Setting.instances[name];
                    delete window[name];
                    li.remove();
                });
            }

            content.appendChild(document.createElement("hr"));

            let new_name = create_input("text", "", {});
            let create_btn = document.createElement("button");
            create_btn.className = "btn btn-primary";
            create_btn.style = "margin-left: 8px";
            create_btn.innerText = "Add";
            create_btn.onclick = () => {
                let name = new_name.value.toUpperCase();
                if (window[name] != undefined)
                {
                    Console.error("Name '" + name + "' is already in use.");
                    return;
                }
                new Setting(name, "number", 0, {}, false);
                build_settings();
            };

            content.appendChild(wrap(new_name, create_btn));
        };

        build_settings();
        Modal.open("Settings", content, () => {
            document.querySelector("#settings_list").innerHTML = "";

            for (let name in Setting.instances)
            {
                let src = Setting.instances[name];
                if (src.type == 'range')
                    src.set_value(clamp(src.value, src.settings.min, src.settings.max));

                src.display();
            }
        });
    }

    static build_slider_form(name, min, max, resolution)
    {
        let minmax = `
            <label for="${name}-min">Min</label>
            <input type="number" style="padding: 0 8px" class="form-control"
                id="${name}-min" value="${min}">

            <label for="${name}-max">Max</label>
            <input type="number" style="padding: 0 8px" class="form-control"
                id="${name}-max" value="${max}">
        `;

        let res = resolution == undefined ? '' : `
            <label for="${name}-res">Res</label>
            <input type="number" style="padding: 0 8px" class="form-control"
                id="${name}-res" value="${resolution}">
        `;

        let form = document.createElement("form");
        form.className = "single-line";
        form.style = "margin-bottom: 0; justify-content: space-between; gap: 8px";
        form.innerHTML = minmax + res;

        return form;
    }
}

document.querySelector("#edit_settings").onclick = () => Setting.edit()
