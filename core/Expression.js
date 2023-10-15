class Expression
{
    static instances = {};

    constructor(source, name)
    {
        this.name = name;
        this.is_function = (name == undefined);
        this.set_source(source);
        if (this.is_function)
            this.create_editor();

        if (source == undefined)
            on_settings();

        Expression.instances[this.name] = this;
    }

    set_source(source)
    {
        if (this.is_function)
        {
            try {
                if (source instanceof Function) source = source.toString();
                this.function = eval("(" + source + ")");

                this.source = source;
                this.parse_parameters();

                // Handle Renaming
                if (this.name != this.function.name && window[this.name] != undefined)
                {
                    delete Expression.instances[this.name];
                    delete window[this.name];
                    for (let plot of Plot.tab_list.tabs)
                        plot.functions = plot.functions.map(f => f == this.name ? this.function.name : f);
                }
                this.name = this.function.name;
                Expression.instances[this.name] = this;
                window[this.name] = this.function;
            } catch (error) {
                Console.error(error);
                return false;
            }
        }
        else
        {
            let [number, dependencies] = Variable.eval_with_proxy(source);
            if (dependencies == null)
            {
                if (this.source == null)
                {
                    this.source = "0";
                    this.parameters = [];
                }
                return false;
            }

            this.source = source;
            this.parameters = dependencies;
        }
        return true;
    }

    parse_parameters()
    {
        let STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
        let FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
        let FN_ARG_SPLIT = /,/;
        let fnText = this.source.replace(STRIP_COMMENTS, '');
        let argDecl = fnText.match(FN_ARGS);
        let parameters = argDecl[1].split(FN_ARG_SPLIT);
        for (let i = 0; i < parameters.length; i++)
            parameters[i] = parameters[i].trim();
        this.parameters = parameters;
    }

    create_editor()
    {
        let lines = this.source.split(/\r\n|\r|\n/);
        let line_count = Math.min(15, lines.length);
        if (lines.length > 2 && lines[1].indexOf('{') != -1)
        {
            let skip = 0, idx = lines[1].indexOf('{');
            for (let i = 0; i < idx; i++) skip += lines[1][i] == ' ' ? 1 : 4;
            for (let i = 1; i < lines.length; i++)
            {
                let j = 0, rem = 0;
                for (; rem < skip; j++)
                    rem += (lines[i][j] == ' ') ? 1 : 4;
                lines[i] = lines[i].substr(j);
            }
            this.source = lines.join("\n");
        }

        let div = document.createElement("div");
        div.id = this.name + "-editor";
        div.style = `height: ${line_count*16 + 8}px`;
        div.className = "editor";
        div.innerHTML = this.source;
        add_list_element('#function_list', "", [div]);

        let editor = ace.edit(div);
        editor.setTheme("ace/theme/monokai");
        editor.session.setMode("ace/mode/javascript");
        editor.renderer.setScrollMargin(4, 0);

        let refresher, self = this;
        editor.session.on('change', function(delta) {
            clearTimeout(refresher);
            refresher = setTimeout(function() {
                for (let annotation of editor.getSession().getAnnotations())
                    if (annotation.type == "error") return;
                self.set_source(editor.getValue());
            }, 500);
        });
    }

    repaint()
    {
        let editor = document.querySelector('#' + this.name + '-editor');
        if (editor == undefined) return;

        editor = ace.edit(editor).session.setValue(this.source);

    }

    compile(axes)
    {
        let definitions = "";
        let dependencies = Variable.get_dependencies(this.parameters, axes);
        axes = axes.map(v => (v instanceof Variable) ? v.name : v);

        if (dependencies.size != 0)
        {
            let sorted = Variable.sort_by_dependency(dependencies, axes);
            definitions = `let ${sorted.map(v => v.name + "=" + v.value).join(',')};`;
        }

        let body = !this.is_function ? `${definitions} return ${this.source}` :
            `${definitions} return ${this.name}(${this.parameters.join(',')})`
        return new Function(axes, body);
    }
}

let default_func = `function new_function()
{
    return 0;
}`;

document.querySelector("#edit_functions").onclick = () => { new Expression(default_func); }
