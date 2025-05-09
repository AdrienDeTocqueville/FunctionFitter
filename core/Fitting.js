class Fitting
{
    static tab_list = new TabList('#fitting_list', Fitting);

    constructor(settings = {}, name)
    {
        this.name = name || "model_" + (Fitting.tab_list.tabs.length + 1);

        this.ref = settings.ref || Object.keys(Expression.instances)[0];
        if (this.ref instanceof Function) this.ref = this.ref.name;
        this.samples = settings.samples;
        this.scatter = settings.scatter;

        this.constant = new Set(settings.constant);
        this.expression = new Expression(settings.value || "0", this.name);

        Fitting.tab_list.add_element(this);
        Fitting.create_settings_dropdown();
    }

    on_display(parent)
    {
        let repaint = () => {
            parent.innerHTML = "";
            garbage_collect_editors();

            let expr = Expression.instances[this.ref];
            let setting = Setting.instances[this.ref];
            let is_scatter = (!expr || expr.is_scatter());

            // Inputs
            let inputs = expr ? expr.parameters : setting ? Object.keys(setting.value) : [];
            {
                let input_table = new Table(["Input", "Settings"]);
                for (let i = 0; i < inputs.length; i++)
                {
                    if (is_scatter && inputs[i] == this.scatter)
                        continue;

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

            // Expression
            {
                let value_editor = create_editor(this.expression.source, (value) => {
                    return this.expression.set_source(value);
                });
                parent.appendChild(value_editor);
                parent.appendChild(document.createElement("br"));
            }

            // Variables
            let variables = Variable.get_dependencies(this.expression.parameters, inputs);
            if (variables.size != 0)
            {
                let var_table = new Table(["Variable", "Value"]);
                for (let variable of variables)
                    var_table.add_row([variable.name, variable.get_editor()]);
                parent.appendChild(var_table.element);
            }

            // Reference

            let block = document.createElement("div");
            block.style = "border: 1px solid rgba(0, 0, 0, .125); position: relative; padding: 8px 0px 2.75rem 8px;";

            let add_param = (param) => {
                param[1].style.width = "120px";
                param = wrap(param[1], param[0]);
                param.style = "padding-bottom: .5rem;";
                block.appendChild(param);
            }

            var ref_choices = Object.keys(Expression.instances);
            for (let setting in Setting.instances)
            {
                if (Setting.instances[setting].type == 'table')
                    ref_choices.push(setting);
            }

            let ref_settings = {
                values: ref_choices,
                disabled_values: [this.name],
                label: "Reference",
                id: "ref-button",
            };
            add_param(create_input("dropdown", this.ref, ref_settings, (r) => {
                this.ref = r;
                repaint();
            }));

            let valid_ref = expr != undefined || setting != undefined;
            if (is_scatter && valid_ref)
            {
                let scatter_settings = { label: "Output" };

                if (expr)
                    scatter_settings.values = expr.parameters;
                else
                    scatter_settings.values = Object.keys(Setting.instances[this.ref].value);

                if (scatter_settings.length != 0 && !scatter_settings.values.includes(this.scatter))
                {
                    this.scatter = scatter_settings.values[0];
                    return repaint();
                }

                add_param(create_input("dropdown", this.scatter, scatter_settings, (new_scatter) => {
                    this.scatter = new_scatter;
                    repaint();
                }));

                if (expr)
                {
                    add_param(create_input("number", this.samples || 1024, { label: "Samples" }, (new_count) => {
                        this.samples = new_count;
                    }));
                }

                valid_ref &= this.scatter != undefined;
            }

            let fit_button = document.createElement("button");
            fit_button.className = "btn btn-sm btn-primary";
            fit_button.type = "button";
            fit_button.innerText = "Fit function";
            fit_button.disabled = this.worker != null || !valid_ref;
            fit_button.style = "position: absolute; bottom: .5rem; right: 8px";
            fit_button.onclick = () => {
                this.fit();
                repaint_all();
            }

            block.appendChild(fit_button)

            parent.appendChild(block);
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

        let expr = Expression.instances[this.ref];
        let setting = Setting.instances[this.ref];
        let is_scatter = (!expr || expr.is_scatter());

        let inputs = expr ? expr.parameters : Object.keys(setting.value);
        let axes = inputs.filter(v => !this.constant.has(v));
        axes = axes.map(v => Variable.get(v));

        let dataset;
        if (is_scatter)
        {
            axes = axes.filter(v => v.name != this.scatter);
            dataset = this.build_scatter_dataset(axes, expr, setting);
        }
        else
        {
            dataset = this.build_dataset(axes, expr.compile(axes));
        }

        // Compute initial values
        let axis_count = axes.length;
        let initial_values = [];
        for (let v of Variable.get_dependencies(this.expression.parameters, inputs))
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

    build_scatter_dataset(axes, expr, setting)
    {
        let num_axis = axes.length;

        let x_values, y_values;

        if (expr)
        {
            let count = this.samples || 1024;
            x_values = new Array(count);
            y_values = new Array(count);

            try {

                for (let i = 0; i < count; i++)
                {
                    let sample = expr.function(i);

                    x_values[i] = new Array(num_axis);
                    for (let j = 0; j < num_axis; j++)
                    {
                        let val = sample[axes[j].name];
                        x_values[i][j] = val != undefined ? val : 0;
                    }

                    y_values[i] = sample[this.scatter];
                }
            } catch (error) {
                Console.error(expr.name + ': ' + error, expr.name);
            }
        }
        else
        {
            y_values = setting.value[this.scatter];
            x_values = new Array(y_values.length);

            for (let i = 0; i < x_values.length; i++)
            {
                x_values[i] = new Array(num_axis);
                for (let j = 0; j < num_axis; j++)
                {
                    let val = setting.value[axes[j].name];
                    x_values[i][j] = val != undefined ? val[i] : 0;
                }
            }
        }

        return {x_values, y_values};
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
        let expr = Expression.instances[this.ref];
        let setting = Setting.instances[this.ref];
        let is_scatter = (!expr || expr.is_scatter());

        let inputs = expr ? expr.parameters : Object.keys(setting.value);
        let axes = inputs.filter(v => !this.constant.has(v));
        axes = axes.map(v => Variable.get(v));
        if (is_scatter)
            axes = axes.filter(v => v.name != this.scatter);

        let dependencies = Variable.get_dependencies(this.expression.parameters, axes);
        axes = axes.map(v => (v instanceof Variable) ? v.name : v);

        let export_name = "export_" + this.name;
        let result =`function ${export_name}(${axes.join(', ')})\n`;
        result += '{\n';

        if (dependencies.size != 0)
        {
            let sorted = Variable.sort_by_dependency(dependencies, axes);
            result += sorted.map(v => `\tlet ${v.name} = ${v.value};\n`).join('');
        }

        result += `\treturn ${this.expression.source};\n`;
        result += '}\n';

        let exported = Expression.instances[export_name];
        if (exported == undefined)
            return new Expression(result);

        exported.set_source(result);
        exported.repaint();
        return exported;
    }

    on_settings()
    {
        Fitting.dropdown_menu.style.opacity = 2;
        Fitting.dropdown_menu.style.visibility = "visible";
    }

    rename(new_name)
    {
        if (!this.expression.rename(new_name))
            return false;

        // Rename the model and UI
        let node = Fitting.tab_list.get_dom_node(this);
        node.innerText = new_name;
        this.name = new_name;

        return true;
    }

    static create_settings_dropdown()
    {
        if (Fitting.dropdown_menu != null)
            return;

        let dropdown_item = (txt, onclick) => {
            let dropdown_item = document.createElement("a");
            dropdown_item.className = "dropdown-item";
            dropdown_item.innerText = txt;
            dropdown_item.onclick = onclick;
            return dropdown_item;
        };

        let dropdown_menu = document.createElement("div");
        dropdown_menu.className = "dropdown-menu";
        dropdown_menu.style = "position: absolute; top: 35px; right: 0px; opacity: 0; visibility: hidden";

        let divider = document.createElement("div");
        divider.className = "dropdown-divider";

        dropdown_menu.appendChild(dropdown_item('Rename', () => {
            let self = Fitting.tab_list.active_tab.$element;
            Modal.open("Rename Model", project_modal_content(self.name, "Rename", (new_name) => self.rename(new_name)));
            document.querySelector("#modal input").focus();
        }));
        dropdown_menu.appendChild(dropdown_item('Export', () => Fitting.tab_list.active_tab.$element.export()));
        dropdown_menu.appendChild(divider);
        dropdown_menu.appendChild(dropdown_item('Delete', () => Fitting.tab_list.remove(Fitting.tab_list.active_tab.$element)));

        let parent = Fitting.tab_list.settings.parentElement;
        parent.insertBefore(dropdown_menu, parent.firstChild);

        Fitting.dropdown_menu = dropdown_menu;

        window.onclick = (event) => {
            if (Fitting.dropdown_menu.style.opacity == 1)
                Fitting.dropdown_menu.style.visibility = "hidden";
            if (Fitting.dropdown_menu.style.opacity > 0)
                Fitting.dropdown_menu.style.opacity--;
        };
    }
}
