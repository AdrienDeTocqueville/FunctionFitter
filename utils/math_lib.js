function max(a, b)      { return Math.max(a, b); }
function min(a, b)      { return Math.min(a, b); }
function saturate(x)    { return Math.max(0, Math.min(x, 1)); }
function clamp(x, a, b) { return Math.max(a, Math.min(x, b)); }
function round(x)       { return Math.round(x); }
function floor(x)       { return Math.floor(x); }
function sqrt(x)        { return Math.sqrt(x); }
function abs(x)         { return Math.abs(x); }
function frac(x)        { return x - Math.trunc(x); }
function lerp(x, y, t)  { return (1 - t) * x + t * y; }
function rcp(x)         { return 1 / x; }

function float2(x, y)   { return {x, y}; }
function float3(x, y, z){ return {x, y, z}; }
function dot(a, b)      { return a.x*b.x + a.y*b.y + a.z*b.z; }
function add(a, b)      { return float3(a.x+b.x, a.y+b.y, a.z+b.z); }
function sub(a, b)      { return float3(a.x-b.x, a.y-b.y, a.z-b.z); }
function mul(a, b)      { return float3(a.x*b, a.y*b, a.z*b); }
function normalize(a)   { return mul(a, 1.0 / Math.sqrt(dot(a, a))); }

function random(min = 0, max = 1) { return Math.random() * (max - min) + min; }
function truncate(x, precision=2) { return Number(x.toFixed(precision)); }

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
