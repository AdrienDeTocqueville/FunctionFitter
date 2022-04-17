function rcp(x) { return 1 / x; }
function float2(x, y) { return {x, y}; }
function float3(x, y, z) { return {x, y, z}; }
function dot(a, b) { return a.x*b.x + a.y*b.y + a.z*b.z; }
function normalize(a) { let f = 1.0 / Math.sqrt(dot(a, a)); return float3(a.x*f, a.y*f, a.z*f); }
function add(a, b) { return float3(a.x+b.x, a.y+b.y, a.z+b.z); }
function sub(a, b) { return float3(a.x-b.x, a.y-b.y, a.z-b.z); }

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
