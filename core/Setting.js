class Setting
{
    static instances = {};
	
	static default_button = 'Console.log("Hello")';

    constructor(name, type, initial_value, settings = {}, refresh_ui = true)
    {
        if (window[name] != undefined)
            return;

        this.name = name;
        this.type = type;
        this.settings = {...settings};
		this.settings.integer = false;
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
			step: this.settings.integer ? 1.0 : undefined,
			innerText: this.settings.label,
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
		{
            value = clamp(value, this.settings.min, this.settings.max);
			if (this.settings.integer)
				value = round(value);
		}
        if (this.type == "button" && !this.settings.label)
		{
			this.settings.label = Setting.default_button;
		}

        window[this.name] = value;
        this.value = value;
    }

    set_type(type)
    {
        let allowed = ["number", "range", "checkbox", "button", "text", "lut"];
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

                    values: ["number", "range", "checkbox", "button", "LUT (todo)"],
                    width: '150px',
                };
                var [type, label] = create_input('dropdown', src.type, type_settings, (new_type) => {
                    src.set_type(new_type)
                    build_settings();
                });

                let settings;
                if (src.type == "range")
                {
                    let form = Setting.build_slider_form(name, src.settings.min, src.settings.max, undefined, src.settings.integer);
                    form[0].onchange = (e) => { src.settings.min = min(e.target.valueAsNumber, src.settings.max); }
                    form[1].onchange = (e) => { src.settings.max = max(e.target.valueAsNumber, src.settings.min); }
                    form[2].onchange = (e) => { src.settings.integer = e.target.checked; }

                    settings = wrap(form);
                }
                else if (src.type == "button")
                {
                    settings = create_input("text", Setting.default_button, {}, (txt) => {
						src.settings.label = txt;
					});
                }

                add_list_element(content, "display: flex; flex-direction: row", [label, type, settings], (li) => {
                    delete Setting.instances[name];
                    delete window[name];
                    li.remove();
                });
            }

            content.appendChild(document.createElement("hr"));

            let new_name = create_input("text", "", { callback: (new_text) => {
				let name = new_text.trim().toUpperCase();
				create_btn.disabled = name == "" || window[name] != undefined;
			} });
            let create_btn = document.createElement("button");
            create_btn.className = "btn btn-primary";
            create_btn.style = "margin-left: 8px";
            create_btn.innerText = "Add";
			create_btn.disabled = true;
            create_btn.onclick = () => {
                let name = new_name.value.trim().toUpperCase();
                if (name == "" || window[name] != undefined)
                {
                    Console.error("Name '" + name + "' is invalid.");
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

    static build_slider_form(name, min, max, resolution, integer)
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
		
		let integ = integer == undefined ? '' : `
            <label for="${name}-int">Integer</label>
            <input type="checkbox" style="padding: 0 8px" class="form-check-input"
                id="${name}-int" value="${integer}">
        `;

        let form = document.createElement("form");
        form.className = "single-line";
        form.style = "margin-bottom: 0; justify-content: space-between; gap: 8px";
        form.innerHTML = minmax + res + integ;

        return form;
    }
}

document.querySelector("#edit_settings").onclick = Setting.edit
