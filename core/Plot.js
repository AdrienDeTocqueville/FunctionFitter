class Plot
{
    static tab_list = new TabList('#plot_list', Plot, true);

    static Types = {
        Line: 'Line',
        Scatter: 'Scatter',
        Histogram: 'Histogram',
    };

    constructor(settings = {}, name)
    {
        this.name = name || "Plot " + (Plot.tab_list.tabs.length + 1);

        let to_func = (name) => {
            return {
                type: Plot.Types.Line,
                name,
            };
        };

        this.functions = settings.functions || [];
        for (let i = 0; i < this.functions.length; i++)
        {
            if (this.functions[i] instanceof Function)
                this.functions[i] = to_func(this.functions[i].name);
            else if (typeof(this.functions[i]) == "string")
                this.functions[i] = to_func(this.functions[i]);
        }

        this.scatter = settings.scatter || [];

        this.axis_1 = settings.axis_1;
        this.axis_2 = settings.axis_2;
        this.scatter_axis = settings.scatter_axis;
        this.dimensions = settings.dimensions;
        if (this.dimensions == undefined)
            this.dimensions = this.axis_2 ? 1 : 0;

        Plot.tab_list.add_element(this);
    }

    get_dimensions() { return this.dimensions || 0 };
    is_axis(name) { return (name == this.get_axis_1() || name == this.get_axis_2()); }
    get_axis_1() { if (this.axis_1 == undefined) this.axis_1 = this.get_parameters()[0]; return this.axis_1; };
    get_axis_2() {
        if (this.get_dimensions() == 0) return undefined;
        if (this.axis_2 == undefined) this.axis_2 = this.get_parameters()[1];
        if (this.get_axis_1() == this.axis_2)
        {
            let params = this.get_parameters();
            let axis_1 = params.indexOf(this.get_axis_1());
            this.axis_2 = params[axis_1 == 0 ? 1 : 0];
        }
        return this.axis_2;
    }

    get_parameters()
    {
        let params = [];
        for (let func of this.functions)
        {
            if (func.name in Expression.instances)
                params = params.concat(Expression.instances[func.name].parameters);
            else if (func.name in Setting.instances)
            {
				for (let key of Object.keys(Setting.instances[func.name].value))
					params.push(key);
            }
            else
                Console.error(func + " is not a Function or a Setting.");
        }
        return [...new Set(params)]; // Remove duplicates
    }

    on_display(parent)
    {
        if (this.functions.length == 0) return;

        if (this.element === undefined)
            this.element = document.createElement("div");
        parent.appendChild(this.element);

        let grid = document.createElement("div");
        parent.appendChild(grid);

        // Build sliders
        grid.style = "display: flex; flex-wrap: wrap; gap: 4px 20px;";
        let axes = [this.get_axis_1(), this.get_axis_2()];
        for (let variable of Variable.get_dependencies(this.get_parameters(), axes))
        {
            if (!variable.is_number())
                continue;

            let slider = variable.get_slider();
            slider.style = "width: 280px";
            grid.appendChild(slider);
        }

        this.display_plot();
    }

    display_plot()
    {
        // Build traces
        let traces = this.functions.map(func => this.gen_plot(func));

        // Build layout
        let layout = { width: this.element.parentNode.clientWidth - 30, uirevision: true };
        let make_axis = (text, range) => ({ range: [range.min, range.max], title: {text} });
        if (this.get_dimensions() == 0)
        {
            let axis_1 = this.get_axis_1();
            layout.xaxis = make_axis(axis_1, Variable.get(axis_1));
            layout.yaxis = { title: "" };
        }
        else
        {
            let axis_1 = this.get_axis_1();
            let axis_2 = this.get_axis_2();
            layout.scene = {
                xaxis: make_axis(axis_1, Variable.get(axis_1)),
                yaxis: make_axis(axis_2, Variable.get(axis_2)),
                zaxis: { title: "" },
            }
        }

        Plotly.react(this.element, traces, layout);
    }

    gen_plot(func)
    {
        return (func.type == Plot.Types.Line) ? this.gen_trace(func.name) : this.gen_scatter(func);
    }

    gen_trace(name)
    {
        let axes = this.get_dimensions() == 0 ? [Variable.get(this.get_axis_1())] :
            [Variable.get(this.get_axis_1()), Variable.get(this.get_axis_2())];

        let model = Expression.instances[name].compile(axes);

        function linspace(v)
        {
            let values = new Array(v.resolution);
            let step = (v.max - v.min) / (v.resolution - 1);
            for (let i = 0; i < v.resolution; i++)
                values[i] = v.min + step * i;
            return values;
        }

        let trace;
        if (this.get_dimensions() == 0)
        {
            trace = {
                type: "line",
                x: linspace(axes[0]),
                y: new Array(axes[0].resolution),
            };

            try {
                for (let i = 0; i < axes[0].resolution; i++)
                    trace.y[i] = model(trace.x[i]);
            } catch (error) {
                Console.error(name + ': ' + error);
            }
        }
        else
        {
            trace = {
                type: "surface",
                x: linspace(axes[0]),
                y: linspace(axes[1]),
                z: new Array(axes[1].resolution),
            };

            try {
                for (let j = 0; j < axes[1].resolution; j++)
                {
                    trace.z[j] = new Array(axes[0].resolution);
                    for (let i = 0; i < axes[0].resolution; i++)
                        trace.z[j][i] = model(trace.x[i], trace.y[j]);
                }
            } catch (error) {
                Console.error(name + ': ' + error);
                for (let j = 0; j < axes[1].resolution; j++)
                    trace.z[j] = new Array(axes[0].resolution);
            }
        }

        trace.name = name;
        return trace;
    }

	gen_scatter(func)
    {
        let axes = this.get_dimensions() == 0 ? [this.get_axis_1()] :
            [this.get_axis_1(), this.get_axis_2()];

		let expr = Expression.instances[func.name];
        let data = Setting.instances[func.name].value;

        // Sanitize output axis
        let scatter_axis = func.scatter;
        let variable_names = expr ? expr.parameters : Object.keys(data);
        if (!variable_names.includes(scatter_axis))
		{
            var axis_opt = new Set(variable_names);
            for (let axis of axes) axis_opt.delete(axis);

			scatter_axis = axis_opt.values().next().value;
		}

        // Build dataset for expression
        if (expr)
        {
            data = {};
            data[scatter_axis] = [];
            for (let axis of axes)
                data[axis] = [];

            for (let i = 0; i < func.sample_count || 64; i++)
            {
                let sample = expr.function(i);

                data[scatter_axis].push(sample[scatter_axis]);
                for (let axis of axes)
                    data[axis].push(sample[axis]);
            }
        }

        // Create dummy data if we have nothing
        let out_data = data[scatter_axis];
        if (out_data == undefined)
        {
            let data_size = data[axes[0]].length;
            out_data = new Array(data_size).fill(0);
        }

        // Generate trace
        let trace = {
            mode: 'markers',
            marker: {
                size: 5,
                line: {
                    width: 0.5
                },
                opacity: 0.8
            },
        };

        if (this.get_dimensions() == 0)
		{
			trace.type = 'scatter';
			trace.x = data[axes[0]];
            trace.y = out_data;

			if (func.type == Plot.Types.Histogram)
			{
				trace.type = 'histogram';
				//trace.autobinx = false;
				//trace.xbins = {
				//	start: 0.9,
				//	end: 1.1,
				//	size: 0.008,

				//};
			}
		}
		else
		{
			trace.type = 'scatter3d';
			trace.x = data[axes[0]];
			trace.y = data[axes[1]];
            trace.z = out_data;
		}


		return trace;
	}

    on_settings()
    {
        let content = document.createElement("div");
        content.style = "width: 600px";

        let build_settings = () => {
            content.innerHTML = "";

			// Sanitize settings
			if (!this.get_parameters().includes(this.get_axis_1()))
				this.axis_1 = undefined;

            var src_choices = Object.keys(Expression.instances);
            for (let setting in Setting.instances)
            {
                if (Setting.instances[setting].type == 'table')
                    src_choices.push(setting);
            }

            let list = document.createElement("ul");
            list.className = "list-group";

            for (let i = 0; i < this.functions.length; i++)
            {
                let elem = document.createElement("li");
                elem.className = "list-group-item";
                elem.style = "display: flex";

                // Function choice
                let src_settings = {
                    values: src_choices,
                    width: "150px",
                };
                elem.appendChild(create_input("dropdown", this.functions[i].name, src_settings, (new_name) => {
                    this.functions[i].name = new_name;
                    build_settings();
                }));

                let expr = Expression.instances[this.functions[i].name];

                // Type
                let type_settings = {
                    values: [Plot.Types.Line, Plot.Types.Scatter, Plot.Types.Histogram],
                    disabled_values: [],
                    width: "100px",
                };

                {
                    let prevent_line = expr ? expr.is_scatter() : true;
                    let prevent_scatter = expr ? !expr.is_scatter() : false;
                    let prevent_histogram = prevent_scatter || this.get_dimensions() == 1;

                    if (this.functions[i].type == Plot.Types.Line && prevent_line) this.functions[i].type = prevent_scatter ? Plot.Types.Histogram : Plot.Types.Scatter;
                    if (this.functions[i].type == Plot.Types.Scatter && prevent_scatter) this.functions[i].type = prevent_line ? Plot.Types.Scatter : Plot.Types.Line;
                    if (this.functions[i].type == Plot.Types.Histogram && prevent_histogram) this.functions[i].type = prevent_line ? Plot.Types.Scatter : Plot.Types.Line;

                    if (prevent_line) type_settings.disabled_values = type_settings.disabled_values.concat(Plot.Types.Line);
                    if (prevent_scatter) type_settings.disabled_values = type_settings.disabled_values.concat(Plot.Types.Scatter);
                    if (prevent_histogram) type_settings.disabled_values = type_settings.disabled_values.concat(Plot.Types.Histogram);
                }

                elem.appendChild(create_input("dropdown", this.functions[i].type, type_settings, (new_type) => {
                    this.functions[i].type = new_type;
                    build_settings();
                }));

				// Scatter choice
                if (this.functions[i].type != Plot.Types.Line)
                {
                    let scatter_settings = { label: "Axis" };
                    if (expr)
                    {
                        let sample_count = create_input("number", this.functions[i].sample_count || 64, { label: "Sample Count" }, (new_count) => {
                            this.functions[i].sample_count = new_count;
                        });
                        elem.appendChild(wrap(sample_count[1], sample_count[0]));

                        scatter_settings.values = Expression.instances[func.name].parameters;
                    }
                    else
                    {
                        scatter_settings.values = Object.keys(Setting.instances[this.functions[i].name].value);
                    }

                    scatter_settings.values = [undefined].concat(scatter_settings.values);
                    let axis = create_input("dropdown", this.functions[i].scatter, scatter_settings, (new_scatter) => {
                        this.functions[i].scatter = new_scatter;
                        build_settings();
                    });
                    elem.appendChild(wrap(axis[1], axis[0]));
                }


				list.appendChild(elem);
            }

            content.appendChild(list);
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
                    values: this.get_parameters(),
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
                let variables = this.get_parameters();

                let table = new Table(["Variable", "Value"]);
                for (let i = 0; i < variables.length; i++)
                {
                    let name = variables[i];
                    let variable = Variable.get(name);
                    if (this.is_axis(name))
                        table.add_row([name, variable.get_slider_form()]);
                    else
                        table.add_row([name, variable.get_editor()]);
                }

                content.appendChild(table.element);
            }

			{
				let delete_btn = document.createElement("button");
				delete_btn.className = "btn btn-danger center-text";
				delete_btn.style = "width: 100%; height: 31px;";
				delete_btn.innerText = "Delete";
				delete_btn.onclick = () => {
					Plot.tab_list.remove(this);
					Modal.close();
				};

				content.appendChild(delete_btn);
			}
        };

        build_settings();
        Modal.open(this.name, content, Plot.tab_list.repaint.bind(Plot.tab_list));
    }

    static repaint()
    {
        let active = Plot.tab_list.get_active_element();
        active?.display_plot();
    }
}
