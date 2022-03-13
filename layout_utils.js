$settings = {
    LUTs: {},
    plots: {},
    models: {},
    references: [],
    parameter_names: [],
    dimensions: undefined,
    parameters: null,
    sliders: [],
};

let shape_selector = document.querySelector("#shape-selector");
shape_selector.onchange = () => {
    $settings.graph_dimensions = parseInt(shape_selector.value);
    dirty_functions();
}
$settings.graph_dimensions = parseInt(shape_selector.value);

let default_func = `function new_function(x, y)
{
    return x + y;
}`;

hook_add_buttons();

/// LISTS

function add_list_element(list, style)
{
    let li = document.createElement("li");
    li.className = "list-group-item";
    li.style = style;

    for (let i = 2; i < arguments.length; i++)
        li.appendChild(arguments[i]);

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
                dirty_functions();
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
        dirty_functions();
    };

    let [box, label] = create_input("checkbox", true, {label: "Bilinear Filtering"}, "bilinear-" + name, () => {
        $settings.LUTs[name].bilinear = box.checked;
        dirty_functions();
    });

    let div = document.createElement("div");
    div.style = "padding-top: 9px";
    div.appendChild(box);
    div.appendChild(label);

    let div2 = document.createElement("div");
    div2.appendChild(input);
    div2.appendChild(div);

    add_list_element('#lut_list', "display: flex; flex-direction: row", canvas, div2);

    return url != null ? load_lut_async(url, name, canvas) : null;
}

/// VARIABLES

function add_variable(name, type, initial_value, settings)
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

    let [input, label] = create_input(type, initial_value, settings, "variable-" + name, (value) => {
        console.log(value);
        window[name] = value;
        dirty_functions();
    });

    label.style = "margin-right: 30px";

    add_list_element('#variable_list', "display: flex; flex-direction: row", label, input);
}


/// FUNCTIONS

function parse_parameters(code)
{
    let STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
    let FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
    let FN_ARG_SPLIT = /,/;
    fnText = code.replace(STRIP_COMMENTS, '');
    argDecl = fnText.match(FN_ARGS);
    parameters = argDecl[1].split(FN_ARG_SPLIT);
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
    let fn = eval("(" + code + ")");
    parameter = parse_parameters(code);

    let target_input = null;
    let params_input = null;

    let refresh_targets = () => {
        let settings = {
            values: $settings.references,
            dropdown: true,
            width: "120px",
            height: "29px",
        };
        let prev = target_input;
        target_input = create_input("number", 0, settings, "target-" + fn.name);
        if (prev != null)
            prev.replaceWith(target_input);

        prev = params_input;
        settings.values = $settings.parameter_names;
        settings.multiple = true;
        params_input = create_input("number", 0, settings, "target-" + fn.name);
        if (prev != null)
            prev.replaceWith(params_input);
    };

    refresh_targets();

    let dataset, interval_id;
    let stop_fitting = () => {
        clearInterval(interval_id);
        for (let i = 0; i < dataset.x.length; i++)
            tf.dispose(dataset.x[i]);
        tf.dispose(dataset.y);

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

        let ref = $settings.plots[$settings.references[target_input.value]].func;
        dataset = generate_dataset(ref);

        interval_id = setInterval(training_step, 50, fn.name, dataset, stop_fitting);
    }

    let controls = document.createElement("div");
    controls.style = "display: flex; flex-direction: row; width: 100%";
    controls.appendChild(target_input);
    controls.appendChild(params_input);
    controls.appendChild(button);

    let editor = document.createElement("div");
    editor.id = "editor-" + fn.name;

    add_list_element('#model_list', "", controls, editor);

    create_code_editor(code, editor, 10, (new_code) => {
        if ($settings.plots[fn.name].display == false)
            return;

        let new_predict, args;
        try {
            let new_func = eval("(" + new_code + ")");
            new_predict = (x) => new_func(x, ...variables);
            args = [...new Array($settings.dimensions - 1)].map(() => tf.tensor(0));
            new_predict(args);
        }
        catch (error) { // Syntax error
            console.log(error);
            if (args != null) args.forEach((arg) => tf.dispose(arg));
            args = null;
            return;
        }

        console.log("model was recompiled");
        $settings.models[fn.name].predict = new_predict;
        $settings.plots[fn.name].predict = new_predict;
        $settings.plots[fn.name].data = null;
        redraw_plots();
    });

    let variables = [];
    for (let i = 1; i < parameters.length; i++)
        variables.push( tf.variable(tf.scalar(0)) );

    let predict = (x) => fn(x, ...variables);

    $settings.models[fn.name] = { error: Infinity, variables, predict, refresh_targets };
    $settings.plots[fn.name] = { data: null, display: true, predict, parameters };
}

function add_reference(code, display)
{
    let fn = eval("(" + code + ")");
    parameter = parse_parameters(code);
    generate_sliders(parameters);

    let [input, label] = create_input("checkbox", display, {label: "Display"}, "display-" + fn.name, () => {
        $settings.plots[fn.name].display = input.checked;
        redraw_plots();
    });

    let editor = document.createElement("div");
    editor.id = "editor-" + fn.name;

    add_list_element('#reference_list', "", input, label, editor);

    create_code_editor(code, editor, 10, (new_code) => {
        if ($settings.plots[fn.name].display == false)
            return;

        let new_func;
        try {
            new_func = eval("(" + new_code + ")");
            new_func(...new Array($settings.dimensions - 1).fill(0));
        } catch (error) { return; } // Syntax error

        $settings.plots[fn.name].func = new_func;
        $settings.plots[fn.name].data = null;
        redraw_plots();
    });

    $settings.references.push(fn.name);
    for (let model in $settings.models)
        $settings.models[model].refresh_targets();

    $settings.plots[fn.name] = { func: fn, data: null, display, parameters };
    if (display)
        redraw_plots();
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
}

function ensure_sliders()
{
    if ($settings.dimensions < $settings.graph_dimensions)
        $settings.graph_dimensions = $settings.dimensions;
    let num_sliders = $settings.dimensions - $settings.graph_dimensions;

    // Disable unndeed sliders
    for (let i = num_sliders; i < $settings.sliders.length; i++)
        $settings.sliders[i].active = -1;

    $settings.sliders = new Array(num_sliders);
    html = num_sliders != 0 ? "<br/>" : "";
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

    for (let i = 0; i < num_sliders; i++)
    {
        html += `<div style="display: flex; flex-direction: row"> <select class='form-select' style='width: 150px' onchange='update_slider(${i})'>`;
        for (let j = 0; j < $settings.parameters.length; j++)
        {
            let slider = $settings.parameters[j];
            let selected = (slider.active == i) ? "selected" : "";
            if (slider.active == -1 || slider.active == i)
                html += `<option value='${j}' ${selected}>${slider.name}</option>`;
        }
        html += `</select>
        <label for="slider-${i}" style="margin: 5px; width: 50px"></label>
        <input style='margin-top: 5px' type="range" class="form-range" id="slider-${i}" min="0" max="1" value="${$settings.sliders[i].value}" step="0.001" oninput="on_slider_change(${i})">
        </div>`;
    }
    let sliders = document.querySelector('#sliders');
    sliders.innerHTML = html;

    //for (let i = 0; i < num_sliders; i++)
    //    on_slider_change(i);
}

function update_slider(index)
{
    let sliderDiv = document.querySelector('#sliders').children[index + 1]; // skip <br>
    let selected = parseInt(sliderDiv.children[0].value);

    $settings.sliders[index].active = -1;
    $settings.sliders[index] = $settings.parameters[selected];
    $settings.sliders[index].active = index;
    dirty_functions();
}

function on_slider_change(index)
{
    let sliderDiv = document.querySelector('#sliders').children[index + 1]; // skip <br>
    let value = truncate(sliderDiv.children[2].valueAsNumber, 3);
    sliderDiv.children[1].innerText = value;
    $settings.sliders[index].value = value;
    dirty_functions(false);
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
            input.className = "form-select";
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
    let width = settings.width || "100%";
    let height = settings.height || "24px";

    if (type == 'range')
    {
        input.value = value;
        input.min = settings.min || 0;
        input.max = settings.max || 1;
        input.step = settings.step || 0.1;

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
            input.style = `width: ${width}; height: ${height}; padding-bottom: 0; padding-top: 0`;

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

function dirty_functions(rebuild_sliders=true)
{
    for (let name in $settings.plots)
        $settings.plots[name].data = null;
    redraw_plots(rebuild_sliders);
}

function redraw_plots(rebuild_sliders=true)
{
    if ($settings.dimensions == undefined)
        return;
    if (rebuild_sliders)
        ensure_sliders();

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
        width: "50%",
        xaxis: { range: [-0.1, 1.1] },
        yaxis: { range: [-0.1, 1.1] },
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
