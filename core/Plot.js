class Plot
{
    static tab_list = new TabList('#plot_list', Plot, true);

    constructor(settings = {}, name)
    {
        this.name = name || "Plot " + (Plot.tab_list.tabs.length + 1);

        this.functions = settings.functions || [];
        for (let i = 0; i < this.functions.length; i++)
        {
            if (this.functions[i] instanceof Function)
                this.functions[i] = this.functions[i].name;
        }

        this.axis_1 = settings.axis_1;
        this.axis_2 = settings.axis_2;
        this.dimensions = settings.dimensions || (this.axis_2 ? 1 : 0);

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
            if (!(func in Expression.instances))
                console.error(func + " is not an Expression");
            params = params.concat(Expression.instances[func].parameters);
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
        let traces = this.functions.map(name => this.gen_trace(name));

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

            for (let i = 0; i < axes[0].resolution; i++)
                trace.y[i] = model(trace.x[i]);
        }
        else
        {
            trace = {
                type: "surface",
                x: linspace(axes[0]),
                y: linspace(axes[1]),
                z: new Array(axes[1].resolution),
            };

            for (let j = 0; j < axes[1].resolution; j++)
            {
                trace.z[j] = new Array(axes[0].resolution);
                for (let i = 0; i < axes[0].resolution; i++)
                    trace.z[j][i] = model(trace.x[i], trace.y[j]);
            }
        }

        trace.name = name;
        return trace;
    }

    on_settings()
    {
        let content = document.createElement("div");
        content.style = "width: 600px";

        let build_settings = () => {
            content.innerHTML = "";

            {
                let func_settings = {
                    values: Object.keys(Expression.instances),
                    label: "Functions",
                    id: "functions",
                    width: "200px",
                };
                let dropdown = create_input("dropdown", this.functions, func_settings, (new_selection) => {
                    this.functions = new_selection;
                    build_settings();
                });

                content.appendChild(wrap(dropdown[1], dropdown[0]));
            }

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

                let table = new Table("Variable", "Value");
                for (let i = 0; i < variables.length; i++)
                {
                    let name = variables[i];
                    let variable = Variable.get(name);
                    if (this.is_axis(name))
                        table.add_row(name, variable.get_slider_form());
                    else
                        table.add_row(name, variable.get_editor());
                }

                content.appendChild(table.element);
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
