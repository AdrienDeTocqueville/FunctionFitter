Split(["#controls", "#main", "#settings"], {sizes: [20, 40, 40]});

let default_func = `function new_function(x, y)
{
    return x + y;
}`;

//hook_add_buttons();

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
        let delete_button = document.createElement("span");
        delete_button.className = "close";
        delete_button.innerHTML = "&times;";
        delete_button.onclick = () => on_delete(li);

        li.appendChild(delete_button);
    }

    document.querySelector(list).appendChild(li);
}

let Modal = {
    open: (title, content) => {
        let modal = document.createElement("div");
        modal.id = "modal";
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h5 style="margin-top: 20px; margin-bottom: 20px">${title}</h5>
            </div>`;

        modal.onclick = (event) => { if (modal == event.path[0]) Modal.close(); }
        modal.querySelector(".close").onclick = Modal.close;

        document.body.appendChild(modal);
        let h5 = modal.querySelector("h5");
        h5.parentNode.insertBefore(content, h5.nextSibling);
    },
    close: () => { document.querySelector("#modal").remove(); }
};

class TabList
{
    // Requirements on elem_type
    // functions: on_display, on_settings
    // properties: name
    constructor(id, elem_type, has_settings = false)
    {
        this.tabs = [];
        this.element = document.querySelector(id);

        this.ul = document.createElement("ul");
        this.ul.className = "nav nav-tabs";

        let li = document.createElement("li");
        li.className = "nav-item nav-link active";
        li.innerText = "+";
        li.tabIndex = -1;
        li.onclick = () => { this.add_element(new elem_type()); }

        this.active_tab = li;

        this.content = document.createElement("div");
        this.content.style = "border: 1px solid #ddd; padding: 15px;"

        this.ul.appendChild(li);
        this.element.appendChild(this.ul);
        this.element.appendChild(this.content);

        if (has_settings)
        {
            this.element.style = "position: relative";
            this.ul.style = "max-width: calc(100% - 20px)";
            let settings = document.createElement("i");
            settings.className = "fa-solid fa-ellipsis-vertical";
            settings.style = "position: absolute; top: 12px; right: 0px; width: 20px; text-align: center";
            settings.onclick = () => {
                if (this.active_tab.tabIndex == -1) return;
                let elem = this.tabs[this.active_tab.tabIndex];
                elem.on_settings();
            }
            this.element.appendChild(settings);
        }
    }

    add_element(elem)
    {
        let li = document.createElement("li");
        li.className = "nav-item nav-link"
        li.innerText = elem.name;
        li.tabIndex = this.tabs.length;
        li.onclick = () => {
            this.active_tab.classList.remove("active");
            this.active_tab = li;
            this.active_tab.classList.add("active");

            this.content.innerHTML = "";
            elem.on_display(this.content);
        }

        this.ul.insertBefore(li, this.ul.children[this.ul.childElementCount-1]);

        this.tabs.push(elem);
        li.onclick();
        if (elem.on_settings != undefined)
            elem.on_settings();
    }
}

class Table
{
    constructor(headers)
    {
        let table = document.createElement("table");
        table.className = "table table-bordered";
        table.innerHTML = "<thead> <tr></tr> </thead> <tbody></tbody>";

        let row = table.querySelector("tr");
        for (let title of arguments)
        {
            let elem = document.createElement("th");
            elem.scope = "col";
            elem.innerText = title;
            row.appendChild(elem);
        }

        this.element = table;
    }

    add_row(elements)
    {
        let body = this.element.querySelector("tbody");
        let row = document.createElement("tr");
        for (let i = 0; i < arguments.length; i++)
        {
            let elem = document.createElement(i == 0 ? "th" : "td");
            if (i == 0) elem.scope = "row";
            if (typeof arguments[i] === "string")
                elem.innerText = arguments[i];
            else
                elem.appendChild(arguments[i]);
            row.appendChild(elem);
        }
        body.appendChild(row);
    }
}

function hook_add_buttons()
{
    document.querySelector("#add_function").onclick = () => {
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
            $settings.settings[name].image = context.getImageData(0, 0, img.width, img.height);

            refresh_all_plots();
            resolve($settings.settings[name]);
        };
        img.onerror = reject;
        img.src = url;
    });
}

function add_lut(name, url, bilinear = true)
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

    let lut_sampler = new Function('x', 'y', 'channel', `return sample_lut('${name}', x, y, channel)`);
    add_setting(name, "lut", lut_sampler, { bilinear, canvas, url });

    return url != null ? load_lut_async(url, name, canvas) : null;
}

function sample_lut(name, x, y, channel)
{
    let lut = $settings.settings[name], data = lut.image;
    if (data == null) return 0;

    x = saturate(x) * (data.width - 1);
    y = saturate(y) * (data.height - 1);

    function load_lut(x, y)
    {
        coord = (x + y * data.width) * 4;
        return data.data[coord + channel] / 255;
    }

    if (!lut.settings.bilinear)
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

    settings.label = name;
    settings.id = "settings-" + name;

    let [input, label] = create_input(type, initial_value, settings, (value) => {
        window[name] = value;
        $settings.settings[name].value = value;
        refresh_all_plots();
    });

    label.style = "margin-right: 30px";

    window[name] = initial_value;
    $settings.settings[name] = { type, value: initial_value, settings: {...settings} };

    add_list_element('#settings_list', "display: flex; flex-direction: row", [label, input], (li) => {
        delete $settings.settings[name];
        delete window[name];
        li.remove();
    });
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
    let line_count = Math.min(min_line_count, code.split(/\r\n|\r|\n/).length - 1);
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

function validate_reference(code)
{
    try {
        let func = eval("(" + code + ")");
        func(...new Array($settings.dimensions - 1).fill(0));
        return func;
    } catch (error) { console.error(error); }
}

function add_function(code, display, refresh = true)
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

    let editor = document.createElement("div");
    editor.id = "editor-" + fn.name;

    add_list_element('#function_list', "", [editor]);

    create_code_editor(code, editor, 15, (new_code) => {
        if ($settings.plots[fn.name].display == false)
            return;

        let new_func = validate_reference(new_code);
        if (new_func == null) return;

        $settings.plots[fn.name].func = new_func;
        refresh_plot(fn.name);
    });

    window[fn.name] = fn;
    $settings.functions[fn.name] = {parameters, func: fn};
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
            $settings.parameters.push({ active: -1, name: parameters[i], index: i,
                value: 0, range: [0, 1], resolution: 64
            });
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

function rebuild_ranges()
{
    ensure_sliders();
    refresh_all_plots();
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
    for (let idx = 0; idx < num_sliders; idx++)
    {
        if (idx != 0)
            $settings.sliderElement.append(document.createElement("hr"));

        let i = idx; // copy for capture
        let div = document.createElement("div");
        div.style = "display: flex; margin-bottom: 8px";

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
            $settings.sliders[i].active = i;

            build_slider();
            refresh_all_plots();
        };

        let create_label = (content) => {
            let label = document.createElement("div");
            label.innerText = content;
            return label;
        };

        let value = truncate($settings.sliders[i].value, 3);
        let value_label = create_label(value);
        value_label.style = "padding: 2px";

        div.append(dropdown, value_label);
        $settings.sliderElement.append(div);

        let sliderDiv = document.createElement("div");
        sliderDiv.className = "single-line";

        let build_slider = () => {
            let slider = document.createElement("input");
            slider.className = "form-range";
            slider.type = "range";
            slider.id = "slider-" + i;
            slider.step = 0.001;
            slider.min = $settings.sliders[i].range[0];
            slider.max = $settings.sliders[i].range[1];
            slider.value = value;
            slider.oninput = () => {
                value = truncate(slider.valueAsNumber, 3);
                value_label.innerText = value;
                $settings.sliders[i].value = value;
                refresh_all_plots();
            }

            let min_label = create_label(slider.min);
            let max_label = create_label(slider.max);
            min_label.style = "cursor: pointer; padding-right: 6px";
            max_label.style = "cursor: pointer; padding-left: 6px";
            min_label.onclick = max_label.onclick = (e) => {
                let form = document.createElement("form");
                form.className = "single-line";
                form.style = "margin-bottom: 0; justify-content: space-between;";
                form.innerHTML = `
                    <label for="slider-min">Min</label>
                    <input id="slider-min" type="number"
                        class="form-control" value="${$settings.sliders[i].range[0]}">

                    <label for="slider-max">Max</label>
                    <input id="slider-max" type="number"
                        class="form-control" value="${$settings.sliders[i].range[1]}">

                    <label for="slider-res">Res</label>
                    <input id="slider-res" type="number"
                        class="form-control" value="${$settings.sliders[i].resolution}">
                `;

                sliderDiv.replaceWith(form);

                form[(e.path[0] == min_label)?0:1].focus();
                form.onkeyup = (e) => {
                    if (e.key == "Enter") e.target.blur();
                };
                form.addEventListener('focusout', (e) => {
                    if (e.relatedTarget == null || e.relatedTarget.parentNode != form)
                    {
                        $settings.sliders[i].range[0] = form[0].valueAsNumber;
                        $settings.sliders[i].range[1] = form[1].valueAsNumber;
                        $settings.sliders[i].resolution = form[2].valueAsNumber;
                        form.replaceWith(sliderDiv);
                        build_slider();
                    }
                });
            }

            sliderDiv.innerHTML = "";
            sliderDiv.append(min_label, slider, max_label);
        }

        build_slider();

        $settings.sliderElement.append(sliderDiv);
    }
}

/// PLOT

function get_dataset(name)
{
    let plot = $settings.plots[name];
    if (plot == null)
        return null;
    if (plot.dataset == null)
        plot.dataset = generate_dataset(plot.func || plot.predict);
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

    let traces = [];
    for (let name in $settings.plots)
    {
        let plot = $settings.plots[name];
        if (!plot.display) continue;
        if (plot.data == null) evaluate_func(name);

        plot.data.name = name;
        traces.push(plot.data);
    }

    let param1, param2;
    for (let i = 0; i < $settings.dimensions - 1; i++)
    {
        if ($settings.parameters[i].active == -1)
        {
            if (param1 == undefined) param1 = $settings.parameters[i];
            else if (param2 == undefined) param2 = $settings.parameters[i];
            else break;
        }
    }

    let make_axis = (text, range) => ({ range: [range[0]-0.1, range[1]+0.1], title: {text} });

    let layout = { title: "Main Plot" };
    if ($settings.graph_dimensions == 2)
    {
        layout.xaxis = make_axis(param1.name, param1.range);
        layout.yaxis = make_axis("y", [-0.1, 1.1]);
    }
    else
    {
        layout.scene = {
            xaxis: make_axis(param1.name, param1.range),
            yaxis: make_axis(param2.name, param2.range),
            zaxis: make_axis("y", [-0.1, 1.1]),
        }
    }

    let div = document.querySelector('#plot');
    Plotly.react(div, traces, layout);
}

function evaluate_func(plot)
{
    let trace = null;
    let dataset = get_dataset(plot);

    if ($settings.graph_dimensions == 2)
    {
        trace = {
            type: "line",
            x: new Array(dataset.resolution),
            y: dataset.y_values,
        };

        for (let i = 0; i < dataset.resolution; i++)
            trace.x[i] = dataset.x_values[i][dataset.axis1];
    }
    else if ($settings.graph_dimensions == 3)
    {
        trace = {
            type: "surface",
            x: new Array(dataset.resolution),
            y: new Array(dataset.resolution),
            z: new Array(dataset.resolution),
        };

        for (let i = 0; i < dataset.resolution; i++)
        {
            trace.x[i] = dataset.x_values[i][dataset.axis1];
            trace.y[i] = dataset.x_values[i*dataset.resolution][dataset.axis2];

            trace.z[i] = new Array(dataset.resolution);
            for (let j = 0; j < dataset.resolution; j++)
                trace.z[i][j] = dataset.y_values[i*dataset.resolution + j];
        }
    }

    $settings.plots[plot].data = trace;
}

/// Project Drawer

function refresh_project_list()
{
    document.querySelector("#project_list").innerHTML = "";
    for (let name in $projects)
    {
        let div = document.createElement("div");
        div.innerText = name;
        div.onclick = () => {
            deserialize($projects[name]);
            set_project_drawer(false);
        };
        add_list_element('#project_list', "", [div], () => {
            delete_project(name);
        });
    }
}

function set_project_drawer(open)
{
    current = this.drawer_opened || false;
    if ((arguments.length == 0 ? !current : open))
    {
        this.drawer_opened = true;
        document.querySelector("#drawer").setAttribute('project-drawer', 'opened');
        document.querySelector("main").setAttribute('project-drawer', 'opened');
    }
    else
    {
        this.drawer_opened = false;
        document.querySelector("#drawer").removeAttribute('project-drawer');
        document.querySelector("main").removeAttribute('project-drawer');
    }
}

document.querySelector("header .fa-bars").onclick = () => set_project_drawer();
document.querySelector("#new-project").onclick = () => {
    deserialize({});
    set_project_drawer(false);
}

/// Misc.

function set_theme(theme)
{
    let current = document.body.getAttribute('data-theme')
    if (theme == current) return;

    theme = theme || (current == 'dark' ? 'light' : 'dark');
    localStorage.setItem('theme', theme);
    document.body.setAttribute('data-theme', theme);
}

function create_input(type, value, settings, onChange)
{
    if (type == "lut")
    {
        let label = document.createElement("label");
        label.htmlFor = settings.canvas.id;
        label.innerText = settings.label;

        let [box, box_label] = create_input("checkbox", settings.bilinear, {label: "Bilinear Filtering", id: "bilinear-" + name}, () => {
            settings.bilinear = box.checked;
            refresh_all_plots();
        });

        let div = document.createElement("div");
        div.style = "padding-top: 9px";
        div.appendChild(box);
        div.appendChild(box_label);

        let input = document.createElement("div");
        input.appendChild(label);
        input.appendChild(div);

        return [input, settings.canvas];
    }


    let input;
    if (type == "dropdown")
    {
        input = document.createElement("div");
        input.className = "btn-group";

        let button = document.createElement("button");
        button.className = "btn btn-sm btn-secondary dropdown-toggle";
        button.type = "button";
        button.disabled = settings.disabled == true;

        let multiselect = Array.isArray(value);
        let update_label = () => {
            if (!multiselect) return button.innerText = settings.values[value];
            let label = "";
            for (let val of value)
                label += (label != "" ? ", " : "") + settings.values[val];
            button.innerText = label;
        }
        update_label();

        let ul = document.createElement("ul");
        ul.className = "dropdown-menu";
        for (let i = 0; i < settings.values.length; i++)
        {
            let disabled = settings.disabled_values && settings.disabled_values.includes(i);
            let li = document.createElement("li");
            li.className = "dropdown-item" + (disabled ? " disabled" : "");
            if (!multiselect)
            {
                li.innerText = settings.values[i];
                if (i == value) li.classList.add("active");
                li.onclick = () => {
                    ul.children[value].classList.remove('active');
                    value = i;
                    ul.children[value].classList.add('active');
                    update_label();
                    if (onChange) onChange(value);
                }
            }
            else
            {
                let [box, label] = create_input("checkbox", value.includes(i), {label: settings.values[i]});
                li.appendChild(box);
                li.appendChild(label);
                li.onclick = (e) => {
                    if (value.includes(i))
                    {
                        box.checked = false;
                        value = value.filter(x => x != i);
                    }
                    else
                    {
                        box.checked = true;
                        value.push(i);
                        value.sort();
                    }
                    update_label();
                    e.stopPropagation();

                    if (onChange) onChange(value);
                }
            }
            ul.appendChild(li);
        }

        input.appendChild(button);
        input.appendChild(ul);
    }
    else if (Array.isArray(settings.values))
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
                html += `<li class='nav-item nav-link ${j==value?"active":""}' style="height: 31px; padding: 0.25rem 0.5rem; font-size: .875rem; cursor: pointer">${settings.values[j]}</li>`;
            input.innerHTML = html;
            for (let j = 0; j < settings.values.length; j++)
            {
                input.children[j].onclick = () => {
                    input.children[value].classList.remove('active');
                    input.children[j].classList.add('active');
                    value = j;
                    if (onChange) onChange(value);
                }
            }
        }
    }
    else
    {
        let classes = {
            checkbox: "form-check-input",
            number: "form-control",
            range: "form-range",
            text: "form-control",
        };

        input = document.createElement("input");
        input.className = classes[type];
        input.type = type;
    }

    if (settings.id == undefined && settings.label != undefined)
        settings.id = "input-" + settings.label;

    input.id = settings.id;
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
        label.htmlFor = settings.id;

        let rangeInput = input;
        input.onchange = null;
        input.oninput = () => {
            label.innerText = truncate(rangeInput.valueAsNumber, 3);
            if (onChange) onChange(rangeInput.valueAsNumber);
        };

        let div = document.createElement("div");
        div.style = `width: ${width}; display: flex; flex-direction: row`;
        div.appendChild(label);
        div.appendChild(input);
        input = div;
    }
    else
    {
        let style = (type == 'checkbox') ? "margin-right: 5px;" :
            `width: ${width}; padding-bottom: 0; padding-top: 0;`;
        if (settings.style != undefined)
            style += settings.style;
        input.style = style;

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
    label.htmlFor = settings.id;
    label.innerHTML = settings.label;
    label.style = "white-space: nowrap; padding: 2px; padding-right: 6px";

    return [input, label];
}
