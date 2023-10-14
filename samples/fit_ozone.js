function OzoneDensity(h)
{
    return max(1 - abs(2*h/OZONE_WIDTH - 2*OZONE_START/OZONE_WIDTH - 1), 0);
}
function HorizonAngle(r)
{
    var sinHoriz = RADIUS / r;
    return -sqrt(saturate(1 - sinHoriz * sinHoriz));
}
function IntersectSphere(radius, cosChi, radialDistance)
{
    var a1 = radius / radialDistance;
    var d = a1*a1 - saturate(1 - cosChi*cosChi);
    return radialDistance * (-cosChi + sqrt(d));
}
function GetSample(s, count, tExit)
{
    var t0 = s / count;
    var t1 = (s+1) / count;
    t0 = t0*t0*tExit;
    t1 = t1*t1*tExit;
    return [lerp(t0, t1, 0.5), t1-t0];
}

if (!deserialize($projects["ozone"]))
{
    function ozone_optical_depth(cosTheta)
    {
        var r = RADIUS + HEIGHT;
        var cosHoriz = HorizonAngle(r);
        var tExit = IntersectSphere(RADIUS + ALTITUDE, cosTheta, r);

        var optical_depth = 0;
        for (var i = 0; i < SAMPLE_COUNT; i++)
        {
            var [t, dt] = GetSample(i, SAMPLE_COUNT, tExit);

            var h = sqrt(r*r + t * (2 * r * cosTheta + t)) - RADIUS;
            var sigmaE = max(OzoneDensity(h), 0.00001);

            optical_depth += sigmaE * dt;
        }
        return (1/177) * optical_depth;
    }
    function model_ozone_optical_depth(cosTheta, a0, b0, c0, a1, b1, c1)
    {
        // Rational function
        return polynom(cosTheta, a0, b0, c0) / polynom(cosTheta, a1, b1, c1);
    }

    function main()
    {
        add_setting("SAMPLE_COUNT", "range", 64, {min: 1, max: 64});
        add_setting("RADIUS", "number", 6378.1);
        add_setting("ALTITUDE", "number", 40);
        add_setting("HEIGHT", "range", 0, {min: 0, max: 49});
        add_setting("OZONE_START", "number", 10);
        add_setting("OZONE_WIDTH", "number", 30);

        new Expression(ozone_optical_depth);
        new Fitting({ref: ozone_optical_depth});
        
        Variable.get("cosTheta").resolution = 64;

        new Plot({
            functions: [ozone_optical_depth]
        });

        set_project_name("ozone");
    }
    main()
}

