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

		let input, label
		if (this.type == "table")
		{
			settings.innerText = "Open";
			[input, label] = create_input("button", null, settings, this.table_editor.bind(this));
		}
		else
		{
			let settings = {
				label: this.name,
				id: "settings-" + this.name,

				min: this.settings.min,
				max: this.settings.max,
				step: this.settings.integer ? 1.0 : undefined,
				innerText: this.settings.label,
			};

			[input, label] = create_input(this.type, this.value, settings, (value) => {
				this.set_value(value);
				Plot.repaint();
			});
		}

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
        let allowed = ["number", "range", "checkbox", "button", "text", "lut", "table"];
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

	table_editor()
	{
		Modal.close();

        let content = document.createElement("ul");
        content.style = "width: 600px";

        let build_settings = (txt_val = "", action_type = 0) => {
            content.innerHTML = "";

			{
				let text_area = document.createElement("textarea");
				text_area.style = "width: 100%";
				text_area.rows = 4;
				text_area.value = txt_val;

                let action = create_input("number", action_type, {
                    values: ["Replace", "Append"],
                    width: "170px",
                    style: "flex-wrap: nowrap",
                }, (new_action) => {
					action_type = new_action;
                });

				let parse = create_input("button", null, {innerText: "Parse", style: "margin-bottom: 15px"}, () => {
					let parsed = parse_table(text_area.value);
					if (parsed == undefined) return;

					function pad_table(table, value) {
						let max_len = 0;
						for (let elem in table)
							max_len = max(max_len, table[elem].length);

						for (let elem in table)
						{
							if (table[elem].length < max_len)
								table[elem].splice(table[elem].length, 0, ...Array(max_len - table[elem].length).fill(value));
						}
					}
					pad_table(parsed, 0);

					let keys = Object.keys(parsed);

					if (action_type == 0 || typeof this.value !== 'object') // Replace
					{
						this.set_value(parsed);
					}
					else // Append
					{
						let combined = {}
						let variables = new Set(Object.keys(this.value).concat(Object.keys(parsed)));

						let table0_len = this.value[Object.keys(this.value)[0]].length;
						let table1_len = parsed[Object.keys(parsed)[0]].length;

						for (let elem of variables)
						{
							let row = [];
							if (elem in this.value)
								row.splice(row.length, 0, ...this.value[elem]);
							else
								row.splice(row.length, 0, ...Array(table0_len).fill(0));

							if (elem in parsed)
								row.splice(row.length, 0, ...parsed[elem]);
							else
								row.splice(row.length, 0, ...Array(table1_len).fill(0));

							combined[elem] = row;
						}

						this.set_value(combined);
					}

					build_settings(text_area.value, action_type);
				});

				content.appendChild(text_area);
				content.appendChild(wrap(action, parse));
			}

			if (typeof this.value === 'object')
			{
				let headers = Object.keys(this.value);
                let value_name = "values";

                let max_row_size = 64;
                let data_size = this.value[headers[0]].length;
                if (data_size > max_row_size)
                {
                    value_name += ` (showing ${max_row_size} of ${data_size}...)`
                    data_size = max_row_size;
                }

				let data = new Table(["variable", value_name], {values: {colSpan: 100}});
				for (let elem in this.value)
				{
					let values = this.value[elem];
					let row = new Array(data_size + 1);
					row[0] = elem;

					for (let i = 0; i < data_size; i++)
						row[i + 1] = values[i].toString();

					data.add_row(row);
				}

				let editing = false;
				data.element.onclick = (e) => {
					let parent = e.target.parentNode;
					if (parent.parentNode.nodeName == "THEAD") return;

					if (editing) return;
					editing = true;

					let i = e.target.cellIndex;
					let var_name = parent.children[0].innerText;

					let editor = create_input(i == 0 ? "text" : "number", e.target.innerText, {});
					editor.style = "width: 100px";
					e.target.replaceWith(editor);

					editor.focus();
					editor.onkeyup = (e) => { if (e.key == "Enter") e.target.blur(); };
					editor.addEventListener('focusout', (e) => {
						if (i > 0)
						{
							this.value[var_name][i - 1] = editor.valueAsNumber;
							let cell = document.createElement("td");
							cell.innerText = editor.valueAsNumber.toString();
							editor.replaceWith(cell);
						}
						else
						{
							if (editor.value == "" || this.value[editor.value] != undefined) return;

							this.value[editor.value] = this.value[var_name];
							delete this.value[var_name];
							let cell = document.createElement("th");
							cell.innerText = editor.value;
							editor.replaceWith(cell);
						}
						editing = false;
					});
				};


				content.appendChild(data.element);
			}
        };

        build_settings();
        Modal.open("Table Editor", content, () => {
        });
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

                    values: ["number", "range", "checkbox", "button", "LUT (todo)", "table"],
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
                else if (src.type == "table")
                {
                    settings = create_input("button", null, {innerText: "Open"}, src.table_editor.bind(src));
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
