class Fitting
{
    static tab_list = new TabList('#fitting_list', Fitting);

    constructor(ref, value)
    {
        this.name = "model_" + (Fitting.tab_list.tabs.length + 1);

        this.ref = ref.name;
        this.constant = new Set();
        this.expression = new Expression(value || "0", this.name);

        Fitting.tab_list.add_element(this);
    }

    on_display(parent)
    {
        let repaint = () => {
            parent.innerHTML = "";

            let inputs = Expression.instances[this.ref].parameters;
            {
                let input_table = new Table("Input", "Settings");
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
                    input_table.add_row(wrap(checkbox[0], checkbox[1]), settings);
                }
                parent.appendChild(input_table.element);
            }

            {
                //let p = document.createElement("div");
                //p.innerText = "Expression";

                let value_editor = create_editor(this.expression.source, (value) => {
                    return this.expression.set_source(value);
                });
                parent.appendChild(value_editor);
                parent.appendChild(document.createElement("br"));
            }

            let variables = this.expression.parameters.filter(v => !inputs.includes(v));
            if (variables.length != 0)
            {
                let var_table = new Table("Variable", "Value");
                for (let name of variables)
                    var_table.add_row(name, Variable.get(name).get_editor());
                parent.appendChild(var_table.element);
            }

            let dependencies = [].concat(...variables.map(v => Variable.get(v).dependencies));
            dependencies = [...new Set([...dependencies])].filter(v => !variables.includes(v));
            if (dependencies.length != 0)
            {
                let dep_table = new Table("Dependency", "Value");
                for (let name of dependencies)
                    dep_table.add_row(name, Variable.get(name).get_editor());
                parent.appendChild(dep_table.element);
            }


            // Last line

            let ref_settings = {
                values: Object.keys(Expression.instances),
                disabled_values: [this.name],
                label: "Reference",
                id: "ref",
            };
            let ref = create_input("dropdown", this.ref, ref_settings, (r) => {
                this.ref = r;
                repaint();
            });

            let fit_button = document.createElement("button");
            fit_button.className = "btn btn-sm btn-primary";
            fit_button.type = "button";
            fit_button.innerText = "Fit function";

            let row = wrap(wrap(ref[1], ref[0]), fit_button);
            row.style = "justify-content: space-around";
            parent.appendChild(row);
        }

        repaint();
    }
}
