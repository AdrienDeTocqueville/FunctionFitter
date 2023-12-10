function DepthToUnit(z)
{
	z = (1 - z) * NEAR + z * FAR;
	let C0 = 1.0 / NEAR;
	let C1 = 1.0 / log (FAR / NEAR);
    return log ( z * C0 ) * C1 ;
}
function UnitToDepth(z)
{
	let C0 = 1.0 / NEAR;
	let C1 = 1.0 / log (FAR / NEAR);

	z = exp(z / C1) / C0;
	return (z - NEAR) / (FAR - NEAR);
}

function MakeMoments4(z)
{
	let zsq = z * z ;
	return float4(z, zsq, zsq * z ,zsq * zsq);
}

function get_moments(z, alpha)
{
    const kMaxAlpha = 1.0 - 0.5/256.0; // clamp alpha
    let opticalDepth = -log(1.0 - (alpha * kMaxAlpha));
    let unitPos = DepthToUnit(z);
    let o_moments = mul(MakeMoments4(unitPos), opticalDepth);
    let o_opticalDepth = opticalDepth;
    
    return [o_opticalDepth, o_moments];
}

function Compute4MomentUnboundedShadowIntensity(Biased4Moments, FragmentDepth, DepthBias)
{
	// Use short-hands for the many formulae to come
	let b=Biased4Moments;
	let z = float3(FragmentDepth-DepthBias, 0.0, 0.0);

	// Compute a Cholesky factorization of the Hankel matrix B storing only non-
	// trivial entries or related products
	let L21D11=mad(-b[0],b[1],b[2]);
	let D11=mad(-b[0],b[0], b[1]);
	let SquaredDepthVariance=mad(-b[1],b[1], b[3]);
	let D22D11=dot(float2(SquaredDepthVariance,-L21D11),float2(D11,L21D11));
	let InvD11=1.0/D11;
	let L21=L21D11*InvD11;
	let D22=D22D11*InvD11;
	let InvD22=1.0/D22;

	// Obtain a scaled inverse image of bz=(1,z[0],z[0]*z[0])^T
	let c=float3(1.0,z[0],z[0]*z[0]);
	// Forward substitution to solve L*c1=bz
	c[1]-=b[0];
	c[2]-=b[1]+L21*c[1];
	// Scaling to solve D*c2=c1
	c[1]*=InvD11;
	c[2]*=InvD22;
	// Backward substitution to solve L^T*c3=c2
	c[1]-=L21*c[2];
	c[0]-=dot([c[1], c[2]],[b[0], b[1]]);
	// Solve the quadratic equation c[0]+c[1]*z+c[2]*z^2 to obtain solutions 
	// z[1] and z[2]
	let InvC2=1.0/c[2];
	let p=c[1]*InvC2;
	let q=c[0]*InvC2;
	let D=(p*p*0.25)-q;
	let r=sqrt(D);

	z[1]=-p*0.5-r;
	z[2]=-p*0.5+r;

	/*
	let w = float3(0, 0, 0);
	w[0] = 1 - (z[1]*z[2] - b[0]*(z[1]+z[2]) + b[1]) / ((z[0]-z[2])*(z[0]-z[1]));
	w[1] = (z[0]*z[2] - b[0]*(z[0]+z[2]) + b[1]) / ((z[2]-z[1])*(z[0]-z[1]));
	w[2] = 1 - w[0] - w[1];
	w[0] -= w[1];

	z = element_wise(UnitToDepth, [z]);
	w = element_wise(x => 1 - exp(-x * o), [w]);
	print(w);
	*/

	// Compute the shadow intensity by summing the appropriate weights
	let Switch=
		(z[2]<z[0])?float4(z[1],z[0],1.0,1.0):(
		(z[1]<z[0])?float4(z[0],z[1],0.0,1.0):
		float4(0.0,0.0,0.0,0.0));
	let Quotient=(Switch[0]*z[2]-b[0]*(Switch[0]+z[2])+b[1])/((z[2]-Switch[1])*(z[0]-z[1]));

	let OutShadowIntensity=Switch[2]+Switch[3]*Quotient;
	return saturate(OutShadowIntensity);
}

function Hamburger4MSM(z, moments)
{
    moments = lerp(moments, float4(0.0 ,0.375 ,0.0 ,0.375), 3.0e-7);
    return Compute4MomentUnboundedShadowIntensity(moments, z, 0.0);
}

function w(z)
{
    let [o, moments] = get_moments(OCCLUDER1_DEPTH, OCCLUDER1_ALPHA);
    let [o1, moments1] = get_moments(OCCLUDER2_DEPTH, OCCLUDER2_ALPHA);
	o += o1;
	moments = add(moments, moments1);

	if (USE_THREE_OCCLUDERS) {
		let [o2, moments2] = get_moments(OCCLUDER3_DEPTH, OCCLUDER3_ALPHA);
		o += o2;
		moments = add(moments, moments2);
	}

	let COUNT = 128;
	for (let i = 1; i <= COUNT; i++)
	{
	    let zf = FOG_DEPTH * i / COUNT;
		let [ox, momentsx] = get_moments(zf, 1.0 - exp(-FOG * FOG_DEPTH / COUNT));
		o += ox;
		moments = add(moments, momentsx);
	}

	if (o == 0.0)
		return 1.0;

	moments = mul(moments, 1.0 / o); // normalize
	let unitPos = DepthToUnit(z);
	let ma = Hamburger4MSM(unitPos, moments);
	return exp(-ma * o);
}

function w_ref(z)
{
	let points = [[OCCLUDER1_DEPTH, OCCLUDER1_ALPHA]];
	points.push([OCCLUDER2_DEPTH, OCCLUDER2_ALPHA]);
	if (USE_THREE_OCCLUDERS)
		points.push([OCCLUDER3_DEPTH, OCCLUDER3_ALPHA]);

	points.sort((a, b) => {
		return a[0] - b[0];
	});

	let alpha = 1.0;
	for (let i = 0; i < points.length; i++)
	{
		if (points[i][0] > z) break;
		alpha *= (1-points[i][1]);
	}

	let COUNT = 128;
	for (let i = 1; i <= COUNT; i++)
	{
		if (i/COUNT > FOG_DEPTH) break;
		if (i/COUNT > z) break;
		alpha *= exp(-FOG / COUNT);
	}

	return alpha;
}

register_sample("Moments", () => {

    new Setting("NEAR", "number", 0.5);
    new Setting("FAR", "number", 10.0);
    new Setting("USE_THREE_OCCLUDERS", "checkbox", true);
    new Setting("OCCLUDER1_DEPTH", "range", 0.2, {min: 0, max: 1});
    new Setting("OCCLUDER1_ALPHA", "range", 0.3, {min: 0, max: 1});
    new Setting("OCCLUDER2_DEPTH", "range", 0.5, {min: 0, max: 1});
    new Setting("OCCLUDER2_ALPHA", "range", 0.6, {min: 0, max: 1});
    new Setting("OCCLUDER3_DEPTH", "range", 0.7, {min: 0, max: 1});
    new Setting("OCCLUDER3_ALPHA", "range", 0.6, {min: 0, max: 1});
    new Setting("FOG", "range", 0.0, {min: 0, max: 1});
    new Setting("FOG_DEPTH", "range", 0.6, {min: 0, max: 1});

    new Expression(w);
    new Expression(w_ref);
    new Plot({
        functions: [w, w_ref]
    });
});
