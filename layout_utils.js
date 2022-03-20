$settings = {
    LUTs: {},
    plots: {},
    models: {},
    settings: {},
    references: [],
    parameter_names: [],
    dimensions: undefined,
    parameters: null,
    variables: {},
    sliders: [],
    sliderElement: document.querySelector('#sliders'),
    theme: 0,
};

let shape_selector = document.querySelector("#shape-selector");
shape_selector.onchange = () => {
    $settings.graph_dimensions = parseInt(shape_selector.value);
    ensure_sliders();
    refresh_all_plots();
}
$settings.graph_dimensions = parseInt(shape_selector.value);

document.querySelector("#switch-theme").onclick = () => set_theme(1 - $settings.theme);

Split(["#controls", "#plots", "#settings"], {sizes: [20, 40, 40]});

let default_func = `function new_function(x, y)
{
    return x + y;
}`;

hook_add_buttons();

function random(min = 0, max = 1) { return Math.random() * (max - min) + min; }
function truncate(x, precision=2) { return Number(x.toFixed(precision)); }
function saturate(x)              { return Math.max(0, Math.min(x, 1)); }
function lerp(a, t, b)            { return (1 - t) * a + t * b; }
function polynom(x)
{
    let res = arguments[1];
    let x_p = x;
    for (let i = 2; i < arguments.length; i++)
    {
        res += x_p * arguments[i];
        x_p *= x;
    }
    return res;
}


function set_theme(idx)
{
    let themes = ["light-theme", "dark-theme"];

    $settings.theme = idx;
    document.body.className = themes[idx];
    document.querySelectorAll("li").forEach(elem => {
        elem.classList.remove(themes[1-idx]);
        elem.classList.add(themes[idx]);
    });
}

/// LISTS

function add_list_element(list, style, children, on_delete)
{
    let li = document.createElement("li");
    li.className = "deletable-list list-group-item";
    li.style = style;

    for (let child of children)
        li.appendChild(child);

    if (on_delete != null)
    {
        let delete_button = document.createElement("button");
        delete_button.className = "btn-close";
        delete_button.type = "button";
        delete_button.onclick = on_delete;

        li.appendChild(delete_button);
    }

    document.querySelector(list).appendChild(li);
}

function hook_add_buttons()
{
    document.querySelector("#add_lut").onclick = () => {
        add_lut(null, "new_lut");
    }
    document.querySelector("#add_ref").onclick = () => {
        add_reference(default_func, false);
    }

    let editor = null;
    document.querySelector("#edit_variables").onclick = () => {
        let variable_list = document.querySelector("#variable_list");
        if (editor == null)
        {
            let values = "", count = 0;
            for (let name in $settings.variables)
            {
                count++;
                values += `${name} = ${$settings.variables[name].value}\n`;
            }

            editor = document.createElement("textarea");
            editor.rows = count + 4;
            editor.style = "width: 100%";
            editor.value = values;
            variable_list.parentNode.insertBefore(editor, variable_list);
            variable_list.style = "display: none";
        }
        else
        {
            let values = editor.value.split(/[\r\n]+/);
            for (let value of values)
            {
                let parts = value.split(/\s*=\s*/);
                if (parts.length != 2) continue;
                let variable = $settings.variables[parts[0].trim()];
                if (variable == null) continue;
                variable.value = parseFloat(parts[1].trim());
                variable.refresh_input();
            }

            for (let name in $settings.models)
                $settings.models[name].rebuild_model();

            editor.remove();
            editor = null;
            variable_list.style = "display: block";
        }
    }
}

/// LUTS

function load_lut_async(url, name, canvas)
{
    return new Promise((resolve, reject) => {
        let img = new Image();
        img.setAttribute('crossOrigin', '');
        img.onload = () => {
            let context = canvas.getContext('2d');

            context.setTransform(1, 0, 0, 1, 0, 0);
            context.scale(canvas.width / img.width, canvas.height / img.height);

            context.clearRect(0, 0, img.width, img.height);
            context.drawImage(img, 0, 0);
            data = context.getImageData(0, 0, img.width, img.height);
            data.bilinear = true;
            data.url = url;

            let shouldReload = $settings.LUTs[name] != null;
            $settings.LUTs[name] = data;

            if (shouldReload)
                refresh_all_plots();
            resolve(data);
        };
        img.onerror = reject;
        img.src = url;
    });
}

function add_lut(url, name, bilinear = true)
{
    if (name == null)
        name = url.replace(/\.[^/.]+$/, "");

    let canvas = document.createElement("canvas");
    canvas.className = "lut-canvas";
    canvas.style = "margin-right: 20px";
    canvas.width = canvas.height = 64;
    canvas.onclick = async () => {
        const pickerOpts = {
            types: [{
                description: 'Images',
                accept: { 'image/*': ['.png', '.gif', '.jpeg', '.jpg'] }
            }],
            excludeAcceptAllOption: true,
            multiple: false
        };
        [fileHandle] = await window.showOpenFilePicker(pickerOpts);
        let file = await fileHandle.getFile();
        let fr = new FileReader();
        fr.readAsDataURL(file);
        fr.onloadend = function() {
            load_lut_async(fr.result, name, canvas);
        }
    }

    let input = document.createElement("input");
    input.style = "height:25px; width: 100%";
    input.className = "form-control";
    input.value = name;
    input.type = 'text';
    input.onchange = () => {
        let lut = $settings.LUTs[name];
        $settings.LUTs[name] = null;
        name = input.value;
        $settings.LUTs[name] = lut;
        refresh_all_plots();
    };

    let [box, label] = create_input("checkbox", bilinear, {label: "Bilinear Filtering"}, "bilinear-" + name, () => {
        $settings.LUTs[name].bilinear = box.checked;
        refresh_all_plots();
    });

    let div = document.createElement("div");
    div.style = "padding-top: 9px";
    div.appendChild(box);
    div.appendChild(label);

    let div2 = document.createElement("div");
    div2.appendChild(input);
    div2.appendChild(div);

    add_list_element('#lut_list', "display: flex; flex-direction: row", [canvas, div2]);

    return url != null ? load_lut_async(url, name, canvas) : null;
}

/// SETTINGS

function add_setting(name, type, initial_value, settings = {})
{
    // allowed types:
    //  - checkbox
    //  - number
    //  - text
    //  - range

    if (window[name] != undefined)
        return;

    window[name] = initial_value;

    $settings.settings[name] = { type, initial_value, settings: {...settings} };

    settings.label = name;

    let [input, label] = create_input(type, initial_value, settings, "settings-" + name, (value) => {
        window[name] = value;
        refresh_all_plots();
    });

    label.style = "margin-right: 30px";

    add_list_element('#settings_list', "display: flex; flex-direction: row", [label, input]);
}


/// FUNCTIONS

function parse_parameters(code)
{
    let STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
    let FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
    let FN_ARG_SPLIT = /,/;
    fnText = code.replace(STRIP_COMMENTS, '');
    argDecl = fnText.match(FN_ARGS);
    let parameters = argDecl[1].split(FN_ARG_SPLIT);
    for (let i = 0; i < parameters.length; i++)
        parameters[i] = parameters[i].trim();
    return parameters;
}

/*
function test([a, b], [a0, b0])
{
    return 1;
}
print(parse_parameters(test.toString()));
*/

function create_code_editor(code, div, min_line_count, onChange)
{
    let line_count = Math.min(min_line_count, code.split(/\r\n|\r|\n/).length);
    div.style = `margin-top: 5px; height: ${line_count*17 + 8}px`;
    div.className = "editor";
    div.innerHTML = code;

    let editor = ace.edit(div);
    editor.setTheme("ace/theme/monokai");
    editor.session.setMode("ace/mode/javascript");
    editor.renderer.setScrollMargin(4, 0);

    let refresher;
    editor.session.on('change', function(delta) {
        clearTimeout(refresher);
        refresher = setTimeout(function() {
            for (let annotation of editor.getSession().getAnnotations())
                if (annotation.type == "error") return;
            onChange(editor.getValue());
        }, 500);
    });
}

function add_model(code, ref)
{
    let fn = code;
    if (!(code instanceof Function))
        fn = eval("(" + code + ")");
    else
        code = fn.toString();

    if (ref == undefined)
        ref = $settings.references[0];

    let parameters = parse_parameters(code);

    let variables = new Array(parameters.length - 1);
    for (let i = 0; i < variables.length; i++)
    {
        let name = parameters[i+1];
       variables[i] = get_or_create_variable(name);
    }

    let get_variable_values = () => {
        let values = new Array(variables.length);
        for (let i = 0; i < variables.length; i++)
            values[i] = variables[i].value;
        return values;
    }

    let model = { func: fn, variables, ref };
    $settings.models[fn.name] = model;
    $settings.plots[fn.name] = { data: null, display: true, parameters };

    // Create UI
    let target_input = null;
    let params_input = null;
    let mse_label = null;

    let replace_elem = (previous_value, new_value) => {
        if (previous_value != null) previous_value.replaceWith(new_value);
        return new_value;
    }

    model.refresh_targets = () => {
        if (model.ref == undefined)
            model.ref = $settings.references[0];
        let ref_index = $settings.references.indexOf(model.ref);

        let settings = {
            values: $settings.references,
            dropdown: true,
            width: "120px",
        };
        target_input = replace_elem(target_input, create_input("number", ref_index, settings, "target-" + fn.name, (new_index) => {
            model.ref = settings.values[new_index];
        }));

        /*
        settings.values = $settings.parameter_names;
        settings.multiple = true;
        params_input = replace_elem(params_input, create_input("number", 0, settings, "target-" + fn.name));
        */
    };

    model.refresh_mse = () => {
        let ref = model.ref;
        let predict = $settings.plots[fn.name].predict;

        let mse = 0, dataset = get_dataset(ref);
        for (let i = 0; i < dataset.x_values.length; i++)
            mse += Math.pow(predict(dataset.x_values[i]) - dataset.y_values[i], 2);
        mse /= dataset.x_values.length;

        let new_label = document.createElement("div");
        new_label.style = "padding: 2px; margin-left: 20px";
        new_label.innerText = "MSE: " + truncate(mse, 5);
        mse_label = replace_elem(mse_label, new_label);
    };

    model.rebuild_model = () => {
        let values = get_variable_values();
        $settings.plots[fn.name].predict = (x) => fn(x, ...values);
        model.refresh_mse();
        refresh_plot(fn.name);
    };

    model.refresh_targets();
    model.rebuild_model();

    let onstart = () => {
        if (button.innerText == "...")
            return onfinish();

        button.innerText = "...";

        let ref = $settings.references[target_input.value];
        fit_function(model, get_dataset(ref), onstep, onfinish);
    };
    let onstep = () => {
    };
    let onfinish = (new_parameters) => {
        button.innerText = "Fit";
        model.rebuild_model();
    }

    let button = document.createElement("button");
    button.style = "height: 29px; padding-bottom: 0; padding-top: 0; margin-left: auto";
    button.type = "button";
    button.classList.add('btn', 'btn-primary');
    button.innerText = "Fit";
    button.onclick = onstart;

    let controls = document.createElement("div");
    controls.style = "display: flex; flex-direction: row; width: 100%";
    controls.appendChild(target_input);
    controls.appendChild(mse_label);
    controls.appendChild(button);

    let editor = document.createElement("div");
    editor.id = "editor-" + fn.name;

    add_list_element('#model_list', "", [controls, editor]);

    create_code_editor(code, editor, 10, (new_code) => {
        if ($settings.plots[fn.name].display == false)
            return;

        let validate_model = () => {
            try {
                let new_func = eval("(" + new_code + ")");
                new_func([...new Array($settings.dimensions - 1)].fill(0), ...get_variable_values());
                return new_func;
            }
            catch (error) { console.log(error); } // Syntax error
        };

        let new_func = validate_model();
        if (new_func == undefined || new_func.name != fn.name)
            return;

        fn = new_func;
        model.func = new_func;
        model.rebuild_model();
        console.log("model was recompiled");
    });
}

function get_or_create_variable(name, initial_value = undefined)
{
    let variable = $settings.variables[name];
    if (variable == null)
    {
        variable = { value: initial_value || Math.random() };

        let settings = { label: name, step: 0.00001 }
        let [input, label] = create_input("number", null, settings, "variable-" + name, (new_value) => {
            variable.value = new_value;

            for (let name in $settings.models)
            {
                if ($settings.models[name].variables.includes(variable))
                    $settings.models[name].rebuild_model();
            }
        });

        variable.refresh_input = () => {
            input.valueAsNumber = truncate(variable.value, 5);
        };

        variable.refresh_input();
        label.style = "margin-right: 10px";
        add_list_element('#variable_list', "display: flex; flex-direction: row", [label, input]);

        $settings.variables[name] = variable;
    }
    return variable;
}

function validate_reference(code)
{
    try {
        let func = eval("(" + code + ")");
        func(...new Array($settings.dimensions - 1).fill(0));
        return func;
    } catch (error) { console.error(error); }
}

function add_reference(code, display, refresh = true)
{
    let fn;
    if (code instanceof Function)
    {
        fn = code;
        code = fn.toString();
    }
    else
    {
        try {
            fn = eval("(" + code + ")");
        } catch (error) {
            console.error(error);
            return;
        }
    }

    let parameters = parse_parameters(code);
    generate_sliders(parameters);

    let [input, label] = create_input("checkbox", display, {label: "Display"}, "display-" + fn.name, () => {
        $settings.plots[fn.name].display = input.checked;
        draw_plots();
    });

    let editor = document.createElement("div");
    editor.id = "editor-" + fn.name;

    add_list_element('#reference_list', "", [input, label, editor]);

    create_code_editor(code, editor, 10, (new_code) => {
        if ($settings.plots[fn.name].display == false)
            return;

        let new_func = validate_reference(new_code);
        if (new_func == null) return;

        $settings.plots[fn.name].func = new_func;
        refresh_plot(fn.name);
    });

    $settings.references.push(fn.name);
    for (let model in $settings.models)
        $settings.models[model].refresh_targets();

    window[fn.name] = fn;
    $settings.plots[fn.name] = { func: fn, data: null, dataset: null, display, parameters };
    if (refresh) refresh_plot(fn.name);
}

/// SLIDERS

function generate_sliders(parameters)
{
    if ($settings.parameters == null)
    {
        $settings.dimensions = parameters.length + 1;
        $settings.parameters = [];
        for (let i = 0; i < parameters.length; i++)
        {
            $settings.parameter_names.push(parameters[i]);
            $settings.parameters.push({ active: -1, value: 0, name: parameters[i], index: i});
        }
    }
    else if ($settings.dimensions != parameters.length + 1)
    {
        console.error("Wrong dimensions");
        return;
    }
    else
    {
        for (let i = 0; i < parameters.length; i++)
        {
            let found = false;
            for (let name in $settings.plots)
            {
                let plot = $settings.plots[name];
                if (plot.parameters[i] == parameters[i])
                    found = true;
            }
            if (found == false)
            {
                $settings.parameter_names[i] += ", " + parameters[i];
                $settings.parameters[i].name = $settings.parameter_names[i];
            }
        }
    }

    ensure_sliders();
}

function ensure_sliders()
{
    if ($settings.dimensions == undefined)
        return;
    if ($settings.dimensions < $settings.graph_dimensions)
        $settings.graph_dimensions = $settings.dimensions;
    let num_sliders = $settings.dimensions - $settings.graph_dimensions;

    // Disable unndeed sliders
    for (let i = num_sliders; i < $settings.sliders.length; i++)
        $settings.sliders[i].active = -1;

    $settings.sliders = new Array(num_sliders);
    for (let i = 0; i < num_sliders; i++)
    {
        let active = null;
        for (let slider of $settings.parameters)
        {
            if (slider.active == i)
            {
                active = slider;
                break;
            }
            if (slider.active == -1 && active == null)
                active = slider;
        }
        $settings.sliders[i] = active;
        active.active = i;
    }

    $settings.sliderElement.innerHTML = "";
    for (let i = 0; i < num_sliders; i++)
    {
        if (i != 0)
            $settings.sliderElement.append(document.createElement("hr"));

        let index = i;
        let div = document.createElement("div");
        div.style = "display: flex";

        let html = "";
        let dropdown = document.createElement("select");
        dropdown.style = "width: 110px; margin-right: 10px";
        dropdown.className = "form-select form-select-sm";
        for (let j = 0; j < $settings.parameters.length; j++)
        {
            let param = $settings.parameters[j];
            let selected = (param.active == i) ? "selected" : "";
            if (param.active == -1 || param.active == i)
                html += `<option value='${j}' ${selected}>${param.name}</option>`;
        }
        dropdown.innerHTML = html;
        dropdown.onchange = () => {
            let selected = parseInt(dropdown.value);

            $settings.sliders[i].active = -1;
            $settings.sliders[i] = $settings.parameters[selected];
            $settings.sliders[i].active = index;
            refresh_all_plots();
        };

        let value = truncate($settings.sliders[i].value, 3);
        let value_label = document.createElement("div");
        value_label.style = "padding: 2px";
        value_label.innerText = value;

        div.append(dropdown, value_label);
        $settings.sliderElement.append(div);

        let slider = document.createElement("input");
        slider.style = "margin-top: 5px";
        slider.className = "form-range";
        slider.type = "range";
        slider.id = "slider-" + i;
        slider.min = 0;
        slider.max = 1;
        slider.step = 0.001;
        slider.value = value;
        slider.oninput = () => {
            value = truncate(slider.valueAsNumber, 3);
            value_label.innerText = value;
            $settings.sliders[index].value = value;
            refresh_all_plots();
        }

        $settings.sliderElement.append(slider);
    }
}

/// HTML

function create_input(type, value, settings, id, onChange)
{
    classes = {
        checkbox: "form-check-input",
        number: "form-control",
        range: "form-range",
        text: "form-control",
    };

    let input;
    if (Array.isArray(settings.values))
    {
        if (settings.dropdown == true)
        {
            input = document.createElement("select");
            input.className = "form-select form-select-sm";
            let html = "";
            for (let j = 0; j < settings.values.length; j++)
                html += `<option value='${j}' ${j==value?"selected":""}>${settings.values[j]}</option>`;
            input.innerHTML = html;
            if (onChange) input.onchange = () => onChange(parseInt(input.value));
        }
        else
        {
            input = document.createElement("ul");
            input.classList.add('nav', 'nav-pills', 'nav-fill');
            let html = "";
            for (let j = 0; j < settings.values.length; j++)
                html += `<li class='nav-item'><a style="height: 26px; padding-bottom: 0; padding-top: 0" class='nav-link ${j==value?"active":""}'>${settings.values[j]}</a></li>`;
            input.innerHTML = html;
            for (let j = 0; j < settings.values.length; j++)
            {
                input.children[j].onclick = () => {
                    input.children[value].children[0].classList.remove('active');
                    input.children[j].children[0].classList.add('active');
                    value = j;
                    if (onChange) onChange(value);
                }
            }
        }
    }
    else
    {
        input = document.createElement("input");
        input.className = classes[type];
        input.type = type;
    }

    input.id = id;
    input.step = settings.step;
    let width = settings.width || "100%";

    if (type == 'range')
    {
        input.value = value;
        input.min = settings.min || 0;
        input.max = settings.max || 1;

        let label = document.createElement("label");
        label.style = "width: 50px";
        label.innerText = value;
        label.htmlFor = id;

        let rangeInput = input;
        input.onchange = null;
        input.oninput = () => {
            label.innerText = truncate(rangeInput.valueAsNumber, 3);
            if (onChange) onChange(rangeInput.valueAsNumber);
        };

        let div = document.createElement("div");
        div.style = `width: ${width}; height: ${height}; display: flex; flex-direction: row`;
        div.appendChild(label);
        div.appendChild(input);
        input = div;
    }
    else
    {
        if (type == 'checkbox')
            input.style = "margin-right: 5px";
        else
            input.style = `width: ${width}; padding-bottom: 0; padding-top: 0`;

        if (!Array.isArray(settings.values))
        {
            let props = {
                checkbox: "checked",
                number: "valueAsNumber",
                text: "value",
            };
            input[props[type]] = value;
            if (onChange)
                input.onchange = () => onChange(input[props[type]]);
        }
    }

    if (settings.label == undefined)
        return input;

    let label = document.createElement("label");
    label.htmlFor = id;
    label.innerHTML = settings.label;

    return [input, label];
}

/// PLOT

function get_dataset(name)
{
    let plot = $settings.plots[name];
    if (plot == null)
        return null;
    if (plot.dataset == null)
        plot.dataset = generate_dataset(plot.func);
    return plot.dataset;
}

function _dirty_plot(name)
{
    let plot = $settings.plots[name];
    plot.data = null;
    if (plot.dataset != null)
        plot.dataset = null;
    if (plot.predict == null)
    {
        for (let model in $settings.models)
        {
            if ($settings.models[model].ref == name)
                $settings.models[model].refresh_mse();
        }
    }
}

function refresh_plot(name)
{
    _dirty_plot(name);
    draw_plots();
}

function refresh_all_plots()
{
    for (let name in $settings.plots)
        _dirty_plot(name);
    draw_plots();
}

function draw_plots()
{
    if ($settings.dimensions == undefined)
        return;

    traces = [];
    for (let name in $settings.plots)
    {
        let plot = $settings.plots[name];
        if (!plot.display) continue;
        if (plot.data == null) evaluate_func(plot);

        plot.data.name = name;
        traces.push(plot.data);
    }

    let div = document.querySelector('#plot');
    Plotly.react(div, traces, {
        title: "Main Plot",
        xaxis: { range: [-0.1, 1.1] },
        yaxis: { range: [-0.1, 1.1] },
        zaxis: { range: [-0.1, 1.1] },
    })
}

function generate_parameters()
{
    let resolution = 64;
    let axis_1, axis_2;
    let num_sliders = $settings.dimensions - $settings.graph_dimensions;

    let inputs = new Array($settings.dimensions - 1);
    for (let i = 0; i < inputs.length; i++)
    {
        let param = $settings.parameters[i];
        if (param.active != -1)
            inputs[i] = param.value;
        else
        {
            inputs[i] = new Array(resolution);
            for (let j = 0; j < resolution; j++)
                inputs[i][j] = j / (resolution - 1);

            if (axis_1 == undefined) axis_1 = i;
            else if (axis_2 == undefined) axis_2 = i;
        }
    }

    return [inputs, resolution, axis_1, axis_2];
}

function evaluate_func(plot)
{
    let trace = null;
    let [inputs, resolution, axis_x, axis_y] = generate_parameters();

    if ($settings.graph_dimensions == 2)
    {
        trace = {
            type: "line",
            x: inputs[axis_x],
            y: new Array(resolution),
        };
    }
    else if ($settings.graph_dimensions == 3)
    {
        trace = {
            type: "surface",
            x: inputs[axis_x],
            y: inputs[axis_y],
            z: new Array(resolution),
        };
    }

    let parameters = new Array(inputs.length);
    if (plot.predict != null)
    {
        for (let i = 0; i < parameters.length; i++)
        {
            if (!Array.isArray(inputs[i]))
                parameters[i] = inputs[i];
        }

        if ($settings.graph_dimensions == 2)
        {
            for (let i = 0; i < resolution; i++)
            {
                parameters[axis_x] = inputs[axis_x][i];
                trace.y[i] = plot.predict(parameters);
            }
        }
        else if ($settings.graph_dimensions == 3)
        {
            for (let i = 0; i < resolution; i++)
            {
                parameters[axis_x] = inputs[axis_x][i];

                let row = new Array(resolution);
                for (let j = 0; j < resolution; j++)
                {
                    parameters[axis_y] = inputs[axis_y][j];
                    row[j] = plot.predict(parameters);
                }
                trace.z[i] = row;
            }
        }
    }
    else
    {
        for (let i = 0; i < parameters.length; i++)
        {
            if (!Array.isArray(inputs[i]))
                parameters[i] = inputs[i];
        }

        if ($settings.graph_dimensions == 2)
        {
            for (let i = 0; i < resolution; i++)
            {
                parameters[axis_x] = inputs[axis_x][i];
                trace.y[i] = plot.func(...parameters);
            }
        }
        else if ($settings.graph_dimensions == 3)
        {
            for (let i = 0; i < resolution; i++)
            {
                parameters[axis_x] = inputs[axis_x][i];

                let row = new Array(resolution);
                for (let j = 0; j < resolution; j++)
                {
                    parameters[axis_y] = inputs[axis_y][j];
                    row[j] = plot.func(...parameters);
                }
                trace.z[i] = row;
            }
        }
    }

    plot.data = trace;
}

function sample_lut(name, x, y, channel)
{
    let data = $settings.LUTs[name];
    x = saturate(x) * (data.width - 1);
    y = saturate(y) * (data.height - 1);

    function load_lut(x, y)
    {
        coord = (x + y * data.width) * 4;
        return data.data[coord + channel] / 255;
    }

    if (!data.bilinear)
        return load_lut(Math.round(x), Math.round(y));

    let x_low = Math.floor(x);
    let y_low = Math.floor(y);
    let x_lerp = (x - x_low);

    let low = load_lut(x_low, y_low);
    if (x != x_low)
        low = lerp(low, x_lerp, load_lut(x_low+1, y_low));

    let high = low;
    if (y != y_low)
    {
        high = load_lut(x_low, y_low+1);
        if (x != x_low)
            high = lerp(high, x_lerp, load_lut(x_low+1, y_low+1));
    }

    return lerp(low, y - y_low, high);
}
