class Variable
{
    static instances = {};

    static get(name, fallback)
    {
        let v = this.instances[name];
        if (v != undefined || name == undefined)
            return v;
        return new Variable(name, fallback);
    }

    static get_dependencies(variables, ignore)
    {
        ignore = new Set((ignore || []).map(v => (v instanceof Variable) ? v.name : v));

        function track_dependencies(variable)
        {
            if (ignore.has(variable.name)) return;
            if (dependencies.has(variable)) return;

            dependencies.add(variable);
            for (let d of variable.dependencies)
                track_dependencies(Variable.get(d));
        }

        let dependencies = new Set();
        variables.forEach(v => { track_dependencies(v instanceof Variable ? v : Variable.get(v)); });
        return dependencies;
    }

    static sort_by_dependency(variables, ignore)
    {
        ignore = new Set((ignore || []).map(v => (v instanceof Variable) ? v.name : v));
        variables = new Set([...variables].map(v => (v instanceof Variable) ? v : Variable.get(v)));

        let definitions = [], has_change;
        do {
            has_change = false;
            for (const variable of variables)
            {
                if (variable.dependencies.some(v => !ignore.has(v)))
                    continue;

                definitions.push(variable);
                ignore.add(variable.name);
                has_change = true;

                variables.delete(variable);
            }
        } while (has_change);
        return definitions;
    }

    constructor(name, values)
    {
        this.name = name;

        this.min    = values?.min     || 0;
        this.max    = values?.max     || 1;
        this.resolution = values?.res || 32;

        if (this.max < this.min)
            this.max = this.min + 1;

        if (values?.__proto__ === Object.prototype)
            values = values.value;
        this.set_value(values || this.min);
        Variable.instances[name] = this;
    }

    is_number()
    {
        return typeof this.value === "number";
    }

    set_value(value, update_range = true)
    {
        let [number, dependencies] = Variable.eval_with_proxy(value);
        if (dependencies == null) return false;
        if (dependencies.includes(this.name)) return false;
        for (let name of dependencies)
        {
            let dependency = Variable.instances[name];
            if (dependency === undefined) continue;
            if (dependency.dependencies.includes(this.name)) return false;
        }

        this.value = value;
        this.dependencies = dependencies;

        if (dependencies.length == 0)
        {
            if (update_range)
            {
                if (number > this.max) this.max = Math.ceil(value/10)*10;
                if (number < this.min) this.min = Math.floor(value/10)*10;
            }
            else
                number = clamp(number, this.min, this.max);

            this.value = number;
        }

        return true;
    }

    get_editor()
    {
        return create_editor(this.value, this.set_value.bind(this));
    }

    get_slider(show_label = true)
    {
        let create_label = (content) => {
            let label = document.createElement("span");
            label.innerText = content;
            return label;
        };

        let slider = document.createElement("input");
        slider.className = "form-range";
        slider.type = "range";
        slider.id = this.name + "-slider";
        slider.step = (this.max-this.min) / (this.resolution - 1);
        slider.min = this.min;
        slider.max = this.max;
        slider.value = this.value;
        slider.oninput = () => {
            this.value = slider.valueAsNumber;
            if (show_label) value_label.innerText = this.value;
            Plot.repaint();
        }
        slider.onchange = repaint_all;


        let min_label = create_label(slider.min);
        let max_label = create_label(slider.max);
        min_label.style = "cursor: pointer; padding-right: 6px";
        max_label.style = "cursor: pointer; padding-left: 6px";

        let slider_div = wrap(min_label, slider, max_label);
        min_label.onclick = max_label.onclick = (e) => {
            let origin = e.target == min_label ? 0 : 1;
            let form = this.get_slider_form();
            slider_div.replaceWith(form);

            form[origin].focus();
            form.onkeyup = (e) => { if (e.key == "Enter") e.target.blur(); };
            form.addEventListener('focusout', (e) => {
                if (e.relatedTarget?.parentNode == form) return;
                this.value = clamp(this.value, this.min, this.max);
                repaint_all();
                //slider.step = (this.max-this.min) / this.resolution;
                //min_label.innerText = slider.min = this.min;
                //max_label.innerText = slider.max = this.max
                //slider.value = this.value;
                //if (show_label) value_label.innerText = this.value;
                //form.replaceWith(slider_div);
            });
        };


        if (!show_label)
            return slider_div;

        let font_style = "font-style: italic; font-family: 'Times New Roman', Symbola, serif;";
        font_style += "padding-left: 4px";

        let label = create_label(this.name + " =");
        let value_label = create_label(this.value);
        label.style = font_style;
        value_label.style = font_style;

        let div = document.createElement("div");
        div.appendChild(wrap(label, value_label));
        div.appendChild(slider_div);

        return div;
    }

    get_slider_form()
    {
        let form = Setting.build_slider_form(this.name, this.min, this.max, this.resolution);

        form[0].onchange = (e) => { this.min = min(e.target.valueAsNumber, this.max); this.value = clamp(this.value, this.min, this.max); }
        form[1].onchange = (e) => { this.max = max(e.target.valueAsNumber, this.min); this.value = clamp(this.value, this.min, this.max); }
        form[2].onchange = (e) => { e.target.value = this.resolution = max(e.target.valueAsNumber, 2); }

        return form;
    }
}

Variable.eval_with_proxy = (code) =>
{
    let references = new Set(), retry = true;
    let proxy = new Proxy(Variable.instances, {
        get(target, key) {
            if (typeof key === "string")
                references.add(key);
            return 0;
        }
    });

    let value;
    while (retry)
    {
        retry = false;
        try
        {
            value = eval(`with (proxy) {${code}}`);
        }
        catch (error)
        {
            let split = error.message.indexOf(" ");
            let msg = error.message.substr(split);
            if (msg != " is not defined")
            {
                Console.error(error.message);
                return [null, null];
            }

            let name = error.message.substr(0, split);
            if (Variable.instances[name] != undefined)
            {
                Console.error(`Variable ${name} should be passed as parameter.`);
                return [null, null];
            }

            // Create missing variable and retry
            Variable.get(name);
            references.clear();
            retry = true;
        }
    }

    let dependencies = [...references];
    return [value, dependencies];
};
