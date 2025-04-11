class Fitting
{
    static tab_list = new TabList('#fitting_list', Fitting);

    constructor(settings = {}, name)
    {
        this.name = name || "model_" + (Fitting.tab_list.tabs.length + 1);

        this.ref = settings.ref || Object.keys(Expression.instances)[0];
        if (this.ref instanceof Function) this.ref = this.ref.name;

        this.constant = new Set(settings.constant);
        this.expression = new Expression(settings.value || "0", this.name);

        Fitting.tab_list.add_element(this);
    }

    on_display(parent)
    {
        let repaint = () => {
            parent.innerHTML = "";

            let inputs = Expression.instances[this.ref].parameters;
            {
                let input_table = new Table(["Input", "Settings"]);
                for (let i = 0; i < inputs.length; i++)
                {
                    let constant = this.constant.has(inputs[i]);
                    let checkbox = create_input("checkbox", !constant, {label: inputs[i]}, (trainable) => {
                        if (trainable)
                            this.constant.delete(inputs[i]);
                        else
                            this.constant.add(inputs[i]);
                        repaint_all();
                    });
                    let settings = !constant ? Variable.get(inputs[i]).get_slider_form()
                        : Variable.get(inputs[i]).get_slider(false);
                    input_table.add_row([wrap(checkbox[0], checkbox[1]), settings]);
                }
                parent.appendChild(input_table.element);
            }

            {
                let value_editor = create_editor(this.expression.source, (value) => {
                    return this.expression.set_source(value);
                });
                parent.appendChild(value_editor);
                parent.appendChild(document.createElement("br"));
            }

            let variables = Variable.get_dependencies(this.expression.parameters, inputs);
            if (variables.size != 0)
            {
                let var_table = new Table(["Variable", "Value"]);
                for (let variable of variables)
                    var_table.add_row([variable.name, variable.get_editor()]);
                parent.appendChild(var_table.element);
            }

            // Last line

            let ref_settings = {
                values: Object.keys(Expression.instances),
                disabled_values: [this.name],
                label: "Reference",
                id: "ref-button",
            };
            let ref = create_input("dropdown", this.ref, ref_settings, (r) => {
                this.ref = r;
                repaint();
            });

            let fit_button = document.createElement("button");
            fit_button.className = "btn btn-sm btn-primary";
            fit_button.type = "button";
            fit_button.innerText = "Fit function";
            fit_button.disabled = this.worker != null;
            fit_button.onclick = () => {
                this.fit();
                repaint_all();
            }

            let dropdown = document.createElement("button");
            dropdown.className = "btn btn-sm btn-primary dropdown-toggle dropdown-toggle-split";

            let dropdown_item = (txt, onclick) => {
                let dropdown_item = document.createElement("a");
                dropdown_item.className = "dropdown-item";
                dropdown_item.innerText = txt;
                dropdown_item.onclick = onclick;
                return dropdown_item;
            };

            let dropdown_menu = document.createElement("button");
            dropdown_menu.className = "dropdown-menu";
            dropdown_menu.innerHTML = ['Dropout', 'Export'].map(i => dropdown_item(i)).join('')

            dropdown_menu.appendChild(dropdown_item('Dropout', () => {}));
            dropdown_menu.appendChild(dropdown_item('Export', () => this.export()));

            let button_group = wrap(fit_button, dropdown, dropdown_menu);
            button_group.className = "btn-group";

            let row = wrap(wrap(ref[1], ref[0]), button_group);
            row.style = "justify-content: space-around";
            parent.appendChild(row);
        }

        repaint();
    }

    fit()
    {
        // Create worker thread
        try {
            this.worker = new Worker("core/fit_function_worker.js", {name: this.name});
        } catch (error) {
            Console.error("Failed to construct worker. Use the <a href='https://adriendetocqueville.github.io/FunctionFitter/'>real website</a> or launch your browser with <i>--allow-file-access-from-files</i>.");
            return;
        }

        this.worker.onerror = (e) => Console.error(e);

        // Find input axes
        let ref = Expression.instances[this.ref];
        let axes = ref.parameters .filter(v => !this.constant.has(v)) .map(v => Variable.get(v));
        let axis_count = axes.length;

        // Build dataset
        let dataset = this.build_dataset(axes, ref.compile(axes));

        // Compute initial values
        let initial_values = [];
        for (let v of Variable.get_dependencies(this.expression.parameters, axes))
        {
            if (v.is_number() && !this.constant.has(v.name))
            {
                axes.push(v);
                initial_values.push(v.value);
            }
        }

        // Transfer global scope
        let globals = {};
        for (let name in Setting.instances)
        {
            if (!(window[name] instanceof Function))
                globals[name] = window[name];
        }
        for (let name in Expression.instances)
        {
            let expr = Expression.instances[name];
            if (expr.type != Expression.Types.Unnamed)
                globals[name] = expr.source;
        }

        // Completion callback
        this.worker.onmessage = (event) => {

            if (event.data.type == "onfinish")
            {
                delete this.worker;

                Console.log("Fitted with MSE = " + squared_error(model, dataset, event.data.payload));
            }

            for (let i = axis_count; i < axes.length; i++)
                axes[i].set_value(event.data.payload[i - axis_count]);

            repaint_all();
        };

        // Start async process
        let model = this.expression.compile(axes);
        this.worker.postMessage({ model: model.toString(), initial_values, dataset, globals });
    }

    build_dataset(axes, ref)
    {
        let num_axis = axes.length;
        let num_points = 1;
        for (let axis of axes)
            num_points *= axis.resolution;

        // x
        let x_values = new Array(num_points);
        for (let i = 0; i < num_points; i++)
        {
            x_values[i] = new Array(num_axis);
            let stride = num_points, idx = i;
            for (let j = num_axis-1; j >= 0; j--)
            {
                stride /= axes[j].resolution;
                let new_idx = Math.floor(idx / stride);
                idx -= new_idx * stride;

                let step = (axes[j].max - axes[j].min) / (axes[j].resolution - 1);
                x_values[i][j] = axes[j].min + step * new_idx;
            }
        }

        // y
        let y_values = new Array(num_points);
        for (let i = 0; i < num_points; i++)
            y_values[i] = ref(...x_values[i]);

        return {x_values, y_values};
    }

    export()
    {
        let ref = Expression.instances[this.ref];

        let export_name = "export_" + this.name;
        let axes = ref.parameters .filter(v => !this.constant.has(v)) .map(v => Variable.get(v));
        let dependencies = Variable.get_dependencies(this.expression.parameters, axes);
        axes = axes.map(v => (v instanceof Variable) ? v.name : v);

        let result =`function ${export_name}(${axes.join(', ')})\n`;
        result += '{\n';

        if (dependencies.size != 0)
        {
            let sorted = Variable.sort_by_dependency(dependencies, axes);
            result += sorted.map(v => `\tlet ${v.name} = ${v.value};\n`).join('');
        }

        result += `\treturn ${this.expression.source};\n`;
        result += '}\n';

        let expr = Expression.instances[export_name];
        if (expr == undefined)
            return new Expression(result);

        expr.set_source(result);
        expr.repaint();
        return expr;
    }
}
