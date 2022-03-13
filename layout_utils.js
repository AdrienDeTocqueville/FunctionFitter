$settings = {
    LUTs: {},
    plots: {},
    models: {},
    references: [],
    dimensions: 0,
    graph_dimensions: 2,
    parameters: null,
    sliders: null,
};

let shape_selector = document.querySelector("#shape-selector");
shape_selector.onchange = () => {
    $settings.graph_dimensions = parseInt(shape_selector.value);
    dirty_functions();
}

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
    let refresh_targets = () => {
        let settings = {
            values: $settings.references,
            dropdown: true,
            width: "120px",
            height: "29px",
        };
        let prev = target_input;
        target_input = create_input("number", 0, settings, "target-" + fn.name, () => {
        });
        if (prev != null)
            prev.replaceWith(target_input);
    };

    refresh_targets();

    let button = document.createElement("button");
    button.style = "height: 29px; padding-bottom: 0; padding-top: 0; margin-left: auto";
    button.type = "button";
    button.classList.add('btn', 'btn-primary');
    button.innerText = "Fit";
    button.onclick = () => {
        button.innerText = "...";
        let reference = $settings.references[target_input.value];
        let interval_id = setInterval(training_step, 50, fn.name, reference, () => {
            clearInterval(interval_id);
            button.innerText = "Fit";
        });
    }

    let controls = document.createElement("div");
    controls.style = "display: flex; flex-direction: row; width: 100%";
    controls.appendChild(target_input);
    controls.appendChild(button);

    let editor = document.createElement("div");
    editor.id = "editor-" + fn.name;

    add_list_element('#model_list', "", controls, editor);

    create_code_editor(code, editor, 10, (new_code) => {
        if ($settings.plots[fn.name].display == false)
            return;

        let new_func;
        try {
            new_func = eval("(" + new_code + ")");
        } catch (error) { return; } // Syntax error

        let predict = (x) => new_func(x, ...variables);
        $settings.models[fn.name].predict = predict;
        $settings.plots[fn.name].predict = predict;
        $settings.plots[fn.name].data = null;
        redraw_plots();
    });

    let variables = [];
    for (let i = 1; i < parameters.length; i++)
        variables.push( tf.variable(tf.scalar(Math.random())) );

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
            $settings.parameters.push({ active: -1, value: 0, name: parameters[i], index: i});
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
                $settings.parameters[i].name += ", " + parameters[i];
        }
    }
}

function ensure_sliders()
{
    if ($settings.dimensions < $settings.graph_dimensions)
        $settings.graph_dimensions = $settings.dimensions;
    let num_sliders = $settings.dimensions - $settings.graph_dimensions;

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

    for (let i = 0; i < num_sliders; i++)
        on_slider_change(i);
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
            input.onchange = () => onChange(parseInt(input.value));
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
                    onChange(value);
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

        if (type == "range")
            window[name] = input.children[1].valueAsNumber;
        else
            window[name] = input[props[type]];
            onChange(rangeInput.valueAsNumber);
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
            input.onchange = () => {
                onChange(input[props[type]]);
            }
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

function evaluate_func(plot)
{
    let trace = null;
    let resolution_x = 64;
    let resolution_y = 64;

    if ($settings.graph_dimensions == 2)
    {
        trace = {
            x: new Array(resolution_x),
            y: new Array(resolution_x),
            type: "line"
        };

        let parameters = new Array($settings.dimensions - 1);
        let num_sliders = $settings.dimensions - $settings.graph_dimensions;
        for (let i = 0; i < num_sliders; i++)
        {
            let slider = $settings.sliders[i];
            parameters[slider.index] = slider.value;
        }
        let remaining;
        for (remaining = 0; remaining < parameters.length; remaining++)
        {
            if (parameters[remaining] == undefined)
                break;
        }

        for (let i = 0; i < resolution_x; i++)
            trace.x[i] = i / (resolution_x - 1);

        if (plot.predict != null)
        {
            for (let i = 0; i < parameters.length; i++)
            {
                if (i != remaining)
                    parameters[i] = tf.scalar(parameters[i]);
            }

            for (let i = 0; i < resolution_x; i++)
            {
                tf.tidy(() => {
                    parameters[remaining] = tf.tensor(trace.x[i]);
                    trace.y[i] = plot.predict(parameters).dataSync()[0];
                });
            }

            for (let i = 0; i < parameters.length; i++)
            {
                if (i != remaining)
                    tf.dispose(parameters[i]);
            }
        }
        else
        {
            for (let i = 0; i < resolution_x; i++)
            {
                parameters[remaining] = trace.x[i];
                trace.y[i] = plot.func(...parameters);
            }
        }
    }
    else if ($settings.graph_dimensions == 3)
    {
        trace = {
            x: [],
            y: [],
            z: [],
            type: "surface"
        };

        for (let i = 0; i < resolution_x; i++)
        {
            let x = i / (resolution_x - 1);
            trace.x.push(x);

            let row = [];
            for (let j = 0; j < resolution_y; j++)
            {
                let y = j / (resolution_y - 1);
                if (i == 0) trace.y.push(y);

                row.push(plot.func(x, y));
            }
            trace.z.push(row);
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
