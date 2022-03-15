$settings = {
    LUTs: {},
    plots: {},
    models: {},
    references: [],
    parameter_names: [],
    dimensions: undefined,
    parameters: null,
    variables: {},
    sliders: [],
    sliderElement: document.querySelector('#sliders'),
};

let shape_selector = document.querySelector("#shape-selector");
shape_selector.onchange = () => {
    $settings.graph_dimensions = parseInt(shape_selector.value);
    ensure_sliders();
    refresh_all_plots();
}
$settings.graph_dimensions = parseInt(shape_selector.value);

Split(["#controls", "#plots", "#settings"], {sizes: [20, 40, 40]});

let default_func = `function new_function(x, y)
{
    return x + y;
}`;

hook_add_buttons();

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

function add_lut(url, name)
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

    let [box, label] = create_input("checkbox", true, {label: "Bilinear Filtering"}, "bilinear-" + name, () => {
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

function add_setting(name, type, initial_value, settings)
{
    // allowed types:
    //  - checkbox
    //  - number
    //  - text
    //  - range

    if (window[name] != undefined)
        return;

    window[name] = initial_value;

    settings = settings || {};
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

function add_model(code)
{
    let fn = code;
    if (!(code instanceof Function))
        fn = eval("(" + code + ")");
    else
        code = fn.toString();

    let parameters = parse_parameters(code);

    let variables = new Array(parameters.length - 1);
    for (let i = 0; i < variables.length; i++)
    {
        let name = parameters[i+1];
       variables[i] = get_or_create_variable(name, Math.random());
    }

    let predict = (x) => fn(x, ...variables);

    $settings.models[fn.name] = { error: Infinity, ref: $settings.references[0], variables, predict };
    $settings.plots[fn.name] = { data: null, display: true, predict, parameters };

    // Create UI
    let target_input = null;
    let params_input = null;
    let mse_label = null;

    let replace_elem = (previous_value, new_value) => {
        if (previous_value != null) previous_value.replaceWith(new_value);
        return new_value;
    }

    $settings.models[fn.name].refresh_targets = () => {
        if ($settings.models[fn.name].ref == undefined)
            $settings.models[fn.name].ref = $settings.references[0];
        let ref = $settings.models[fn.name].ref;
        let ref_index = $settings.references.indexOf(ref);

        let settings = {
            values: $settings.references,
            dropdown: true,
            width: "120px",
        };
        target_input = replace_elem(target_input, create_input("number", ref_index, settings, "target-" + fn.name, (new_index) => {
            $settings.models[fn.name].ref = settings.values[new_index];
        }));

        /*
        settings.values = $settings.parameter_names;
        settings.multiple = true;
        params_input = replace_elem(params_input, create_input("number", 0, settings, "target-" + fn.name));
        */
    };

    $settings.models[fn.name].refresh_mse = (mse) => {
        let ref = $settings.models[fn.name].ref;
        mse = mse || compute_mse(predict, get_dataset(ref));
        $settings.models[fn.name].error = mse;

        let new_label = document.createElement("div");
        new_label.style = "padding: 2px; margin-left: 20px";
        new_label.innerText = "MSE: " + truncate(mse, 5);
        mse_label = replace_elem(mse_label, new_label);
    };

    $settings.models[fn.name].refresh_targets();
    $settings.models[fn.name].refresh_mse();

    let interval_id;
    let stop_fitting = () => {
        clearInterval(interval_id);

        let param_str = "";
        for (let i = 0; i < variables.length; i++)
            param_str += `const float ${parameters[i+1]} = ${variables[i].dataSync()[0]};\n`;
        console.log(param_str);

        button.innerText = "Fit";
    }

    let button = document.createElement("button");
    button.style = "height: 29px; padding-bottom: 0; padding-top: 0; margin-left: auto";
    button.type = "button";
    button.classList.add('btn', 'btn-primary');
    button.innerText = "Fit";
    button.onclick = () => {
        if (button.innerText == "...")
            return stop_fitting();

        button.innerText = "...";

        let ref = $settings.references[target_input.value];
        interval_id = setInterval(training_step, 50, fn.name, get_dataset(ref), stop_fitting);
    }

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
                let new_predict = (x) => new_func(x, ...variables);
                new_predict([...new Array($settings.dimensions - 1)].fill(tf.scalar(0)));
                return new_predict;
            }
            catch (error) { console.log(error); } // Syntax error
        };

        let new_predict = tf.tidy(validate_model);
        if (new_predict == undefined)
            return;

        console.log("model was recompiled");
        $settings.models[fn.name].predict = new_predict;
        $settings.plots[fn.name].predict = new_predict;
        refresh_plot(fn.name);
    });
}

function get_or_create_variable(name, value)
{
    if ($settings.variables[name] == null)
    {
        let settings = { label: name, step: 0.00001 }
        let [input, label] = create_input("number", truncate(value, 5), settings, "variable-" + name, (value) => {
            let tensor = $settings.variables[name].tensor;
            tf.tidy(() => tensor.assign(tf.scalar(value)));

            for (let name in $settings.models)
            {
                for (let variable of $settings.models[name].variables)
                {
                    if (variable === tensor)
                    {
                        refresh_plot(name);
                        $settings.models[name].refresh_mse();
                        break;
                    }
                }
            }
        });

        label.style = "margin-right: 10px";
        add_list_element('#variable_list', "display: flex; flex-direction: row", [label, input]);

        value = tf.scalar(value);
        $settings.variables[name] = { tensor: tf.variable(value), input };
        tf.dispose(value);
    }
    return $settings.variables[name].tensor;
}

function refresh_variable(tensor)
{
    for (let name in $settings.variables)
    {
        if ($settings.variables[name].tensor === tensor)
        {
            $settings.variables[name].input.valueAsNumber = truncate(tensor.dataSync()[0], 5);
            return;
        }
    }
}

function validate_reference(code)
{
    try {
        let func = eval("(" + code + ")");
        func(...new Array($settings.dimensions - 1).fill(0));
        return func;
    } catch (error) {
        return null;
    }
}

function add_reference(code, display)
{
    let fn;
    if (code instanceof Function)
    {
        fn = code;
        code = fn.toString();
    }

    let parameters = parse_parameters(code);
    generate_sliders(parameters);

    if (fn == null)
        fn = validate_reference(code);
    if (fn == null)
        fn = validate_reference("() => 0");

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

        window[fn.name] = new_func;
        $settings.plots[fn.name].func = new_func;
        refresh_plot(fn.name);
    });

    $settings.references.push(fn.name);
    for (let model in $settings.models)
        $settings.models[model].refresh_targets();


    $settings.plots[fn.name] = { func: fn, data: null, dataset: null, display, parameters };
    refresh_plot(fn.name);
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
        plot.dataset = generate_dataset(plot);
    return plot.dataset;
}

function _dirty_plot(name)
{
    let plot = $settings.plots[name];
    plot.data = null;
    if (plot.dataset != null)
    {
        for (let i = 0; i < plot.dataset.x.length; i++)
            tf.dispose(plot.dataset.x[i]);
        tf.dispose(plot.dataset.y);
        plot.dataset = null;
    }
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
        tf.tidy(() => {
            let tmp_array = new Array(resolution);
            for (let i = 0; i < parameters.length; i++)
            {
                if (!Array.isArray(inputs[i]))
                {
                    tmp_array.fill(inputs[i]);
                    parameters[i] = tf.tensor(tmp_array);
                }
            }

            if ($settings.graph_dimensions == 2)
            {
                parameters[axis_x] = tf.tensor(inputs[axis_x]);
                trace.y = plot.predict(parameters).dataSync();
            }
            else if ($settings.graph_dimensions == 3)
            {
                for (let i = 0; i < resolution; i++)
                {
                    tmp_array.fill(inputs[axis_x][i]);
                    parameters[axis_x] = tf.tensor(tmp_array);
                    parameters[axis_y] = tf.tensor(inputs[axis_y]);

                    trace.z[i] = plot.predict(parameters).dataSync();
                }
            }
        });
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
