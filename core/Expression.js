class Expression
{
    static instances = {};

    static Types = {
        Unnamed: 0,
        Function: 1,
        Scatter: 2,
    };

    constructor(source, name)
    {
        this.name = name;
        this.type = (name == undefined) ? Expression.Types.Function : Expression.Types.Unnamed;
        this.set_source(source);
        if (this.type != Expression.Types.Unnamed)
            this.create_editor();

        if (source == undefined)
            on_settings();

        Expression.instances[this.name] = this;
    }

    rename(new_name)
    {
        if (this.type != Expression.Types.Unnamed)
        {
            if (window[new_name] != undefined)
                return false;
        }

        if (Expression.instances[new_name] != undefined)
            return false;

        // Clean references to old name
        if (Expression.instances[this.name] != undefined)
        {
            if (this.type != Expression.Types.Unnamed)
                delete window[this.name];

            delete Expression.instances[this.name];

            for (let plot of Plot.tab_list.tabs)
            {
                for (let func of plot.functions)
                {
                    if (func.name == this.name)
                        func.name = new_name;
                }
            }
        }

        // Rename
        this.name = new_name;
        if (this.type != Expression.Types.Unnamed)
            window[this.name] = this.function;
        Expression.instances[this.name] = this;
        return true;
    }

    set_source(source)
    {
        if (this.type != Expression.Types.Unnamed)
        {
            try {
                if (source instanceof Function) source = source.toString();
                this.function = eval("(" + source + ")");

                this.source = source;
                this.parse_parameters();

                // Handle Renaming
                if (this.name != this.function.name)
                {
                    if (!this.rename(this.function.name))
                        throw new Error(`New name is invalid: ${this.function.name}.`);
                }

                // Update in global scope
                window[this.name] = this.function;

                // Remove previous compilation error messages
                Console.clear(this.name);
            } catch (error) {
                Console.error(error, this.name);
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

        if (parameters.length == 1 && parameters[0] == "sample")
        {
            try
            {
                let result = this.function();
                parameters = Object.keys(result);
            }
            catch (error)
            {
                Console.error(`Failed to parse scatter variables for function ${name}.`);
            }

            this.type = Expression.Types.Scatter;
        }
        else
        {
            this.type = Expression.Types.Function;
        }

        this.parameters = parameters;
    }

    is_scatter()
    {
        return this.type == Expression.Types.Scatter;
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
		div.className = 'function-editor';
        div.innerHTML = this.source;

        add_list_element('#function_list', "", [div]);

		let editor = this.create_resizable_editor(div)

        let has_changed = false, self = this;
        editor.session.on('change', function() {
            has_changed = true;
            //for (let annotation of editor.getSession().getAnnotations())
            //    if (annotation.type == "error") return;
        });

        editor.on('blur', function() {
            if (!has_changed) return;
            if (self.set_source(editor.getValue()))
                repaint_all();
            has_changed = false;

        });
    }

	create_resizable_editor(div)
	{
        let editor = ace.edit(div);
        editor.renderer.setScrollMargin(4, 0);

        editor.setOptions({
            maxLines: 20,
            minLines: 5,
            mode: "ace/mode/javascript",
            theme: "ace/theme/monokai",
        });

        register_editor_for_gc(editor);

		return editor;
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

        let body = this.type == Expression.Types.Unnamed ? `${definitions} return ${this.source}` :
            `${definitions} return ${this.name}(${this.parameters.join(',')})`
        return new Function(axes, body);
    }
	
    static edit()
    {
        let content = document.createElement("ul");
        content.style = "width: 600px";

        let build_settings = () => {
            content.innerHTML = "";

            for (let name in Expression.instances)
            {
                let func = Expression.instances[name];
				if (func.type == Expression.Types.Unnamed)
					continue;

				var label = document.createElement("p");
				label.innerText = name;

                add_list_element(content, "display: flex; flex-direction: row", [label], (li) => {
                    delete Expression.instances[name];
                    delete window[name];
                    li.remove();
                });
            }

            content.appendChild(document.createElement("hr"));

            let new_name = create_input("text", "", { callback: (new_text) => {
				let name = new_text.trim();
				create_btn.disabled = name == "" || window[name] != undefined;
			} });
            let create_btn = document.createElement("button");
            create_btn.className = "btn btn-primary";
            create_btn.style = "margin-left: 8px";
            create_btn.innerText = "Add";
			create_btn.disabled = true;
            create_btn.onclick = () => {
                let name = new_name.value.trim();
                if (name == "" || window[name] != undefined)
                {
                    Console.error("Name '" + name + "' is invalid.");
                    return;
                }
                new Expression(`function ${name}()\n{\n\treturn 0;\n}`);
                build_settings();
            };

            content.appendChild(wrap(new_name, create_btn));
        };

        build_settings();
        Modal.open("Functions", content, () => {
            document.querySelector("#function_list").innerHTML = "";

            for (let name in Expression.instances)
            {
                let func = Expression.instances[name];
				if (func.type != Expression.Types.Unnamed)
					func.create_editor();
            }
        });
    }
}

document.querySelector("#edit_functions").onclick = Expression.edit;
