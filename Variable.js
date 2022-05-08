class Variable
{
    static instances = {};
    static proxy = new Proxy(Variable.instances, {
        get(target, key) {
            if (typeof key === "string")
                Variable.references.push(key);
            return 0;
        }
    });

    static get(name, fallback)
    {
        let v = this.instances[name];
        if (v == undefined && name != undefined)
            v = this.instances[name] = new Variable(name, fallback);

        return v;
    }

    constructor(name, values)
    {
        this.name = name;

        this.min    = values?.min     || 0;
        this.max    = values?.max     || 1;
        this.resolution = values?.res || 16;

        if (values?.__proto__ === Object.prototype)
            values = values.value;
        this.set_value(values || 0);
    }

    is_number()
    {
        return typeof this.value === "number";
    }

    compile()
    {
        return this.value;
    }

    set_value(value)
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

        this.dependencies = dependencies;
        this.value = dependencies.length == 0 ? number : value;
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
        slider.step = (this.max-this.min) / this.resolution;
        slider.min = this.min;
        slider.max = this.max
        slider.value = this.value;
        slider.oninput = () => {
            this.value = slider.valueAsNumber;
            Plot.repaint();
        }
        slider.onchange = repaint_all;


        let min_label = create_label(slider.min);
        let max_label = create_label(slider.max);
        min_label.style = "cursor: pointer; padding-right: 6px";
        max_label.style = "cursor: pointer; padding-left: 6px";

        let slider_div = wrap(min_label, slider, max_label);
        min_label.onclick = max_label.onclick = (e) => {
            let form = this.get_slider_form();
            slider_div.replaceWith(form);

            form[(e.path[0] == min_label)?0:1].focus();
            form.onkeyup = (e) => { if (e.key == "Enter") e.target.blur(); };
            form.addEventListener('focusout', (e) => {
                if (e.relatedTarget?.parentNode == form) return;
                this.value = clamp(this.value, this.min, this.max);
                slider.step = (this.max-this.min) / this.resolution;
                min_label.innerText = slider.min = this.min;
                max_label.innerText = slider.max = this.max
                slider.value = this.value;
                if (show_label) value_label.innerText = this.value;
                form.replaceWith(slider_div);
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
        let form = document.createElement("form");
        form.className = "single-line";
        form.style = "margin-bottom: 0; justify-content: space-between; gap: 8px";
        form.innerHTML = `
            <label for="${this.name}-min">Min</label>
            <input type="number" style="padding: 0 8px" class="form-control"
                id="${this.name}-min" value="${this.min}">

            <label for="${this.name}-max">Max</label>
            <input type="number" style="padding: 0 8px" class="form-control"
                id="${this.name}-max" value="${this.max}">

            <label for="${this.name}-res">Res</label>
            <input type="number" style="padding: 0 8px" class="form-control"
                id="${this.name}-res" value="${this.resolution}">
        `;

        form[0].onchange = (e) => { this.min = min(e.target.valueAsNumber, this.max); }
        form[1].onchange = (e) => { this.max = max(e.target.valueAsNumber, this.min); }
        form[2].onchange = (e) => { this.resolution = max(e.target.valueAsNumber, 1); }

        return form;
    }
}

Variable.eval_with_proxy = (code) =>
{
    Variable.references = [];
    let retry = true;
    let value;
    while (retry)
    {
        retry = false;
        try
        {
            value = eval(`with (Variable.proxy) {${code}}`);
        }
        catch (error)
        {
            let split = error.message.indexOf(" ");
            let msg = error.message.substr(split);
            if (msg != " is not defined")
                return [null, null];

            // Create missing variable and retry
            let name = error.message.substr(0, split);
                Variable.get(name);
            retry = true;
        }
    }

    let dependencies = [...new Set([...Variable.references])];
    Variable.references = [];
    return [value, dependencies];
};
