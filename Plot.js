class Plot
{
    constructor()
    {
        this.name = "New Plot " + (Plot.tab_list.tabs.length + 1);
        this.functions = ["model_f"];
        this.axis_1 = 0;
    }

    get_dimensions() { return this.dimensions || 0 };
    get_axis_1() { return this.axis_1 || 0 };
    get_axis_2() { return this.get_dimensions() == 0 ? undefined : (this.axis_2 || (this.get_axis_1() == 0 ? 1 : 0)) };
    get_variables()
    {
        let variables = [];
        for (let func of this.functions)
            variables = variables.concat($settings.functions[func].parameters);
        return [...new Set([...variables])]; // Remove duplicates
    }

    on_display(div)
    {
        let plotDiv = document.createElement("div");
        div.appendChild(plotDiv);

        Plotly.newPlot(plotDiv, []);

        /*
        div.innerHTML = `
            <div class="single-line" style="justify-content: space-around; padding-bottom: 4px;">
                <select class="form-select form-select-sm" id="shape-selector" style="width: 200px">
                    <option value="2" selected>2D Graph</option>
                    <option value="3">3D Surface</option>
                </select>
                <div style="display: flex">
                    <label style="margin-right: 10px; font-size: 19px" for="resolution">Resolution</label>
                    <input style="width: 200px" class="form-control form-control-sm" id="resolution" type="number" min="0" value="64"/>
                </div>
            </div>
        `;

        let shape_selector = document.querySelector("#shape-selector");
        shape_selector.onchange = () => {
            $settings.graph_dimensions = parseInt(shape_selector.value);
            ensure_sliders();
            refresh_all_plots();
        }

        let resolution_selector = document.querySelector("#resolution");
        resolution_selector.onchange = () => {
            $settings.resolution = resolution_selector.valueAsNumber;
            refresh_all_plots();
        }
        */
    }

    slider_form(min, max, resolution)
    {
        let form = document.createElement("form");
        form.className = "single-line";
        form.style = "margin-bottom: 0; justify-content: space-between; gap: 8px";
        form.innerHTML = `
                    <label for="slider-min" style="padding: 4px 0px">Min</label>
                    <input id="slider-min" type="number"
                        class="form-control form-control-sm" value="${min}">

                    <label for="slider-max" style="padding: 4px 0px">Max</label>
                    <input id="slider-max" type="number"
                        class="form-control form-control-sm" value="${max}">

                    <label for="slider-res" style="padding: 4px 0px">Res</label>
                    <input id="slider-res" type="number"
                        class="form-control form-control-sm" value="${resolution}">
                `;

        /*
        form[(e.path[0] == min_label)?0:1].focus();
        form.onkeyup = (e) => {
            if (e.key == "Enter") e.target.blur();
        };
        form.addEventListener('focusout', (e) => {
            if (e.relatedTarget == null || e.relatedTarget.parentNode != form)
            {
                $settings.sliders[i].range[0] = form[0].valueAsNumber;
                $settings.sliders[i].range[1] = form[1].valueAsNumber;
                $settings.sliders[i].resolution = form[2].valueAsNumber;
                form.replaceWith(sliderDiv);
                build_slider();
            }
        });
        */

        return form;
    }

    on_settings()
    {
        let wrap = (...elements) => {
            let div = document.createElement("div");
            div.className = "single-line";
            for (let elem of elements)
                div.appendChild(elem);
            return div;
        }

        let content = document.createElement("div");
        content.style = "width: 600px";

        let build_settings = () => {
            content.innerHTML = "";

            let func_settings = {
                values: Object.keys($settings.functions),
                label: "Functions",
                id: "functions",
                width: "200px",
            };
            let selection = this.functions.map(f => func_settings.values.indexOf(f));
            let dropdown = create_input("dropdown", selection, func_settings, (new_selection) => {
                this.functions = new_selection.map(i => func_settings.values[i]);
                build_settings();
            });

            content.appendChild(wrap(dropdown[1], dropdown[0]));
            content.appendChild(document.createElement("br"));

            {
                let pills = create_input("number", this.get_dimensions(), {
                    values: ["2D", "3D"],
                    label: "Dimensions",
                    width: "170px",
                    style: "flex-wrap: nowrap",
                }, (new_dimensions) => {
                    this.dimensions = new_dimensions;
                    build_settings();
                });
                let dims = wrap(pills[1], pills[0]);

                let axis_settings = {
                    label: this.get_dimensions() == 1 ? "Axis Variables" : "Axis Variable",
                    values: this.get_variables(),
                    disabled_values: [this.get_axis_2()],
                    style: "min-width: 80px",
                    width: "unset",
                };
                let axis_x = create_input("dropdown", this.get_axis_1(), axis_settings, (new_axis) => {
                    this.axis_1 = new_axis;
                    build_settings();
                });
                let axis = wrap(axis_x[1], axis_x[0]);

                if (this.get_dimensions() == 1)
                {
                    axis_settings.disabled_values = [this.get_axis_1()];
                    axis_settings.label = undefined;
                    axis_settings.style += "; margin-left: 4px";
                    let axis_z = create_input("dropdown", this.get_axis_2(), axis_settings, (new_axis) => {
                        this.axis_2 = new_axis;
                    build_settings();
                    });
                    axis.appendChild(axis_z);
                }

                let elem = wrap(dims, axis);
                content.appendChild(elem);
                elem.style = "justify-content: space-between";
            }

            content.appendChild(document.createElement("br"));

            {
                let variables = this.get_variables();

                let drop_settings = {
                    values: ["Fixed", "Range", "Trainable"]
                };
                let table = new Table("Variable", "Type", "Settings");
                for (let i = 0; i < variables.length; i++)
                {
                    drop_settings.disabled = i == this.get_axis_1() || i == this.get_axis_2();
                    let drop = create_input("dropdown", 0, drop_settings, (new_type) => {
                        print(new_type);
                    });
                    let settings = "TODO";
                    if (drop_settings.disabled)
                    {
                        settings = this.slider_form(0, 1, 16);
                    }
                    table.add_row(variables[i], drop, settings);
                }

                content.appendChild(table.element);
            }
        };

        build_settings();
        Modal.open(this.name, content);
    }
}

Plot.tab_list = new TabList('#plots', Plot, true);
