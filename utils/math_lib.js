function element_wise(action, vector_args, scalar_args)
{
	if (scalar_args == undefined) scalar_args = [];
	let vec = vector_args.find(Array.isArray);
	if (vec == undefined) return action(...vector_args, ...scalar_args);

	for (let i = 0; i < vector_args.length; i++)
	{
		if (!Array.isArray(vector_args[i]))
			vector_args[i] = Array(vec.length).fill(vector_args[i]);
	}

	let res = Array(vec.length);
	let args = Array(vector_args.length);
	for (let i = 0; i < vec.length; i++)
	{
		for (let j = 0; j < vector_args.length; j++)
			args[j] = vector_args[j][i];
		res[i] = action(...args, ...scalar_args);
	}
	return res;
}

function max(a, b)      { return element_wise(Math.max, [a, b]); }
function min(a, b)      { return element_wise(Math.min, [a, b]); }
function round(x)       { return element_wise(Math.round, [x]); }
function floor(x)       { return element_wise(Math.floor, [x]); }
function sqrt(x)        { return element_wise(Math.sqrt, [x]); }
function ln(x)          { return element_wise(Math.log, [x]); }
function log2(x)        { return element_wise(Math.log2, [x]); }
function log10(x)       { return element_wise(Math.log10, [x]); }
function log(x)         { return element_wise(Math.log, [x]); }
function exp(x)         { return element_wise(Math.exp, [x]); }
function abs(x)         { return element_wise(Math.abs, [x]); }
function saturate(x)    { return element_wise((x) => Math.max(0, Math.min(x, 1)), [x]); }
function clamp(x, a, b) { return element_wise((x, a, b) => Math.max(a, Math.min(x, b)), [x], [a, b]); }
function frac(x)        { return element_wise((x) => x - Math.trunc(x), [x]); }
function lerp(x, y, t)  { return element_wise((x, y, t) => (1 - t) * x + t * y, [x, y], [t]); }

function add(a, b)      { return element_wise((a, b) => a + b, [a, b]); }
function sub(a, b)      { return element_wise((a, b) => a - b, [a, b]); }
function mul(a, b)      { return element_wise((a, b) => a * b, [a, b]); }
function mad(a, b, c)   { return element_wise((a, b, c) => a * b + c, [a, b, c]); }
function rcp(x)         { return element_wise((x) => 1 / x, [x]); }
function rsqrt(x)       { return element_wise((x) => 1 / Math.sqrt(x), [x]); }

function normalize(a)   { return mul(a, 1.0 / Math.sqrt(dot(a, a))); }
function dot(a, b)      { let r=0; for(let i=0;i<a.length;i++) r+=a[i]*b[i]; return r; }

const vec_proxy = {
	get(target, prop)
	{
		let i = ["x", "y", "z", "w"].indexOf(prop);
		if (0 <= i && i <= target.length) return target[i];
    	return Reflect.get(...arguments);
  	},
	set(target, prop, value)
	{
		let i = ["x", "y", "z", "w"].indexOf(prop);
		if (0 <= i && i <= target.length) prop = i;
    	target[prop] = value;
  	},
};

function float2(x, y)       { return new Proxy([x || 0, y || 0], vec_proxy); }
function float3(x, y, z)    { return new Proxy([x || 0, y || 0, z || 0], vec_proxy); }
function float4(x, y, z, w) { return new Proxy([x || 0, y || 0, z || 0, w || 0], vec_proxy); }


function random(min = 0, max = 1) { return Math.random() * (max - min) + min; }
function truncate(x, precision=2) { return Number(x.toFixed(precision)); }

//TODO: reverse
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

function squared_error(model, dataset, params)
{
		let x = dataset.x_values, y = dataset.y_values;
		let error = 0, n = x.length;
		for (let i = 0; i < n; i++)
				error += Math.pow(model(...x[i], ...params) - y[i], 2);
		return error;
}
