
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
function pow(a, b)      { return element_wise(Math.pow, [a, b]); }
function ln(x)          { return element_wise(Math.log, [x]); }
function log2(x)        { return element_wise(Math.log2, [x]); }
function log10(x)       { return element_wise(Math.log10, [x]); }
function log(x)         { return element_wise(Math.log, [x]); }
function exp(x)         { return element_wise(Math.exp, [x]); }
function abs(x)         { return element_wise(Math.abs, [x]); }
function sin(a, b)      { return element_wise(Math.sin, [a, b]); }
function cos(a, b)      { return element_wise(Math.cos, [a, b]); }
function sq(x)          { return element_wise((x) => x*x, [x]); }
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
        return Reflect.set(target, prop, value);
  	},
};

function float2(x, y)       { return new Proxy([x || 0, y || 0], vec_proxy); }
function float3(x, y, z)    { return new Proxy([x || 0, y || 0, z || 0], vec_proxy); }
function float4(x, y, z, w) { return new Proxy([x || 0, y || 0, z || 0, w || 0], vec_proxy); }


function random(min = 0, max = 1) { return Math.random() * (max - min) + min; }
function truncate(x, precision=2) { return Number(x.toFixed(precision)); }

function polynom(x)
{
    let res = arguments[arguments.length-1];
    let x_p = x;
    for (let i = arguments.length - 2; i >= 1; i--)
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

// Return the indices i0, i1 and the t value so that
// value == lerp(axis[i0], axis[i1], t)
function find_lerp(value, axis)
{
	let i0 = axis.length-2;
	for (let i = 0; i < axis.length-1; i++)
	{
		if (axis[i] > value)
		{
			i0 = max(0, i - 1);
			break;
		}
	}
	let i1 = min(i0 + 1, axis.length - 1);

	let v0 = axis[i0], v1 = axis[i1];
	let t = saturate((value - v0) / (v1 - v0));

	return [i0, i1, t];
}

// array2d is indexed by y then by x, cause when you print in the console it's this order
// doesn't support wrapping
function bilinear_sample(array2d, uv)
{
	let size_y = array2d.length;
	let size_x = array2d[0].length;
	
    x = saturate(uv[0]) * (size_x - 1);
    y = saturate(uv[1]) * (size_y - 1);

    let x_low = floor(x);
    let y_low = floor(y);
    let x_lerp = (x - x_low);

    let low = array2d[min(y_low, size_y-1)][min(x_low, size_x-1)];
    if (x_low+1 < size_x)
        low = lerp(low, array2d[min(y_low, size_y-1)][x_low+1], x_lerp);

    let high = low;
    if (y_low+1 < size_y)
    {
        high = array2d[y_low+1][min(x_low, size_x-1)];
		if (x_low+1 < size_x)
			high = lerp(high, array2d[y_low+1][x_low+1], x_lerp);
    }

    return lerp(low, high, y - y_low);
}
