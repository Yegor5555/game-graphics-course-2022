// This demo demonstrates simple cubemap reflections and more complex planar reflections

import PicoGL from "../node_modules/picogl/build/module/picogl.js";
import {mat4, vec3, mat3, vec4, vec2} from "../node_modules/gl-matrix/esm/index.js";

import {positions, normals, indices} from "../blender/helmet.js"
import {positions as planePositions, uvs as planeUvs, indices as planeIndices} from "../blender/plane.js"

// ******************************************************
// **               Light configuration                ** // dont know how to implement =(
// ******************************************************

let baseColor = vec3.fromValues(0.5, 0.8, 0.18);

let numberOfLights = 2;
let pointLightColors = [vec3.fromValues(1.0, 1.0, 1.0), vec3.fromValues(0.6, 0.1, 0.2)];
let pointLightInitialPositions = [vec3.fromValues(5, 0, 2), vec3.fromValues(-5, 0, 2)]; //helmet lights
let pointLightPositions = [vec3.create(), vec3.create()];

// language=GLSL
let lightCalculationShader = `
    uniform vec3 cameraPos;
    uniform vec3 baseColor; 
    uniform vec3 ambientLightColor;    
    uniform vec3 lightColors[${numberOfLights}];        
    uniform vec3 lightPositions[${numberOfLights}];
    
    // This function calculates light reflection using Phong reflection model (ambient + diffuse + specular)
    vec4 calculateLights(vec3 normal, vec3 position) {
        vec3 viewDirection = normalize(cameraPos.xyz - position);
        vec4 color = vec4(ambientLightColor, 1.0);
                
        for (int i = 0; i < lightPositions.length(); i++) {
            vec3 lightDirection = normalize(lightPositions[i] - position);
            
            // Lambertian reflection (ideal diffuse of matte surfaces) is also a part of Phong model                        
            float diffuse = max(dot(lightDirection, normal), -0.1);                                    
                      
            // Phong specular highlight 
            float specular = pow(max(dot(viewDirection, reflect(-lightDirection, normal)), 0.0), 30.0);
            
            // Blinn-Phong improved specular highlight                        
            //float specular = pow(max(dot(normalize(lightDirection + viewDirection), normal), 0.0), 200.0);
            
            color.rgb += lightColors[i] * diffuse + specular;
        }
        return color;
    }
`;                                                          //technique of drawing 3d images
//Shader stage that will process a Fragment generated by the Rasterization into a set of colors and a depth value
let fragmentShader = `
    #version 300 es
    precision highp float;
    ${lightCalculationShader}
    uniform samplerCube cubemap;    
        
    in vec3 vNormal;    //to compute a lighting factor?
    in vec3 viewDir; // camera/view position?
    in vec3 vPosition;  
    out vec4 outColor;

    //in: linkage into shader from previous stage,//out linkage out of a shader to next stage
    
    void main()
    {        
        
        
        vec4 light = calculateLights(normalize(vNormal), vPosition);
        vec3 reflectedDir = reflect(viewDir, normalize(vNormal));
        vec4 ref = texture(cubemap, reflectedDir);
        outColor = light + ref;
        
    }
`;

// language=GLSL
//a graphics processing function used to add special effects to objects in a 3D environment by performing mathematical operations 
let vertexShader = `
    #version 300 es
    ${lightCalculationShader}  
    uniform mat4 modelViewProjectionMatrix; //translates the coordinates of your vertices from model space to world space.
    uniform mat4 modelMatrix; // Model maps from an object's local coordinate space into world space
    uniform mat3 normalMatrix; //for lighting calculations. 
    uniform vec3 cameraPosition;
    
    layout(location=0) in vec4 position;
    layout(location=1) in vec3 normal;
    layout(location=2) in vec2 uv; //uv  is a process projecting a 2D image onto a 3D model's surface.
        
    out vec2 v_uv;
    out vec3 vNormal;
    out vec3 viewDir;
    out vec3 vPosition;  
    
    void main()
    {
        vec4 worldPosition = modelMatrix * position;
        
        vPosition = worldPosition.xyz;
        
        gl_Position = modelViewProjectionMatrix * position;           
        v_uv = uv;
        viewDir = (modelMatrix * position).xyz - cameraPosition;                
        vNormal = normalMatrix * normal;
    }
`;

// language=GLSL
//mirroringshaders on the plane
//Fragment shaders are related to the render window and define the color for each pixel.
let mirrorFragmentShader = `
    #version 300 es
    precision highp float;
    ${lightCalculationShader}
    uniform sampler2D reflectionTex;
    uniform sampler2D distortionMap;
    uniform vec2 screenSize;
    
    in vec2 v_uv ;        
        
    out vec4 outColor;
    
    void main()
    {                        
        vec2 screenPos = gl_FragCoord.xy / screenSize;
        
        // 1.03 is a mirror distortion factor, try making a larger distortion         
        //screenPos.x += (texture(distortionMap, v_uv ).r - 0.5);
        outColor = texture(reflectionTex, screenPos);
    }
`;

// language=GLSL
//Vertex shaders could be define as the shader programs that modifies the geometry of the scene
let mirrorVertexShader = `
    #version 300 es
    ${lightCalculationShader}
    uniform mat4 modelViewProjectionMatrix;
    
    layout(location=0) in vec4 position;   
    layout(location=1) in vec2 uv;
    
    out vec2 v_uv ;
        
    void main()
    {
        v_uv  = uv;
        vec4 pos = position;
        pos.xz *= 2.0;
        gl_Position = modelViewProjectionMatrix * pos;
    }
`;

// language=GLSL
//render window and define the color for each pixel for skybox/cubemap
let skyboxFragmentShader = `
    #version 300 es
    precision mediump float;
    
    uniform samplerCube cubemap;
    uniform mat4 viewProjectionInverse;
    
    in vec4 v_position;
    
    out vec4 outColor;
    
    void main() {
      vec4 t = viewProjectionInverse * v_position;
      outColor = texture(cubemap, normalize(t.xyz / t.w));
    }
`;

// language=GLSL
//shader programs that modifies the geometry of the scene
let skyboxVertexShader = `
    #version 300 es
    
    layout(location=0) in vec4 position;
    out vec4 v_position;
    
    void main() {
        v_position = vec4(position.xz, 1.0, 1.0);
        gl_Position = v_position;
    }
`;

app.enable(PicoGL.DEPTH_TEST);

let program = app.createProgram(vertexShader, fragmentShader);
let skyboxProgram = app.createProgram(skyboxVertexShader, skyboxFragmentShader);
let mirrorProgram = app.createProgram(mirrorVertexShader, mirrorFragmentShader);

let vertexArray = app.createVertexArray()  //creates and initializes a WebGLVertexArrayObject object that 
//                                          represents a vertex array object (VAO) pointing to vertex array data
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, positions))
    //A vertex buffer contains the vertex data used to define your geometry. 
    //Vertex data includes position coordinates, color data, texture coordinate data...
    .vertexAttributeBuffer(1, app.createVertexBuffer(PicoGL.FLOAT, 3, normals))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, indices));
    //memory buffers that contain index data

const planePositionsBuffer = app.createVertexBuffer(PicoGL.FLOAT, 3, planePositions);
const planeUvsBuffer = app.createVertexBuffer(PicoGL.FLOAT, 2, planeUvs);
const planeIndicesBuffer = app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, planeIndices); //for helmet

let skyboxArray = app.createVertexArray()
    .vertexAttributeBuffer(0, planePositionsBuffer)
    .indexBuffer(planeIndicesBuffer);

let mirrorArray = app.createVertexArray()
    .vertexAttributeBuffer(0, planePositionsBuffer)
    .vertexAttributeBuffer(1, planeUvsBuffer)
    .indexBuffer(planeIndicesBuffer);

// Change the reflection texture resolution to checkout the difference
let reflectionResolutionFactor = 0.2;
let reflectionColorTarget = app.createTexture2D(app.width * reflectionResolutionFactor, app.height * reflectionResolutionFactor, {magFilter: PicoGL.LINEAR});
let reflectionDepthTarget = app.createTexture2D(app.width * reflectionResolutionFactor, app.height * reflectionResolutionFactor, {internalFormat: PicoGL.DEPTH_COMPONENT16});
let reflectionBuffer = app.createFramebuffer().colorTarget(0, reflectionColorTarget).depthTarget(reflectionDepthTarget);

let projMatrix = mat4.create();
let viewMatrix = mat4.create();
let viewProjMatrix = mat4.create();
let modelMatrix = mat4.create();
let modelViewMatrix = mat4.create();
let modelViewProjectionMatrix = mat4.create();
let rotateXMatrix = mat4.create();
let rotateYMatrix = mat4.create();
let mirrorModelMatrix = mat4.create();
let mirrorModelViewProjectionMatrix = mat4.create();
let skyboxViewProjectionInverse = mat4.create();
let cameraPosition = vec3.create();

function calculateSurfaceReflectionMatrix(reflectionMat, mirrorModelMatrix, surfaceNormal) {
    let normal = vec3.transformMat3(vec3.create(), surfaceNormal, mat3.normalFromMat4(mat3.create(), mirrorModelMatrix));
    let pos = mat4.getTranslation(vec3.create(), mirrorModelMatrix);
    let d = -vec3.dot(normal, pos);
    let plane = vec4.fromValues(normal[0], normal[1], normal[2], d);

    reflectionMat[0] = (1 - 2 * plane[0] * plane[0]);
    reflectionMat[4] = ( - 2 * plane[0] * plane[1]);
    reflectionMat[8] = ( - 2 * plane[0] * plane[2]);
    reflectionMat[12] = ( - 2 * plane[3] * plane[0]);

    reflectionMat[1] = ( - 2 * plane[1] * plane[0]);
    reflectionMat[5] = (1 - 2 * plane[1] * plane[1]);
    reflectionMat[9] = ( - 2 * plane[1] * plane[2]);
    reflectionMat[13] = ( - 2 * plane[3] * plane[1]);

    reflectionMat[2] = ( - 2 * plane[2] * plane[0]);
    reflectionMat[6] = ( - 2 * plane[2] * plane[1]);
    reflectionMat[10] = (1 - 2 * plane[2] * plane[2]);
    reflectionMat[14] = ( - 2 * plane[3] * plane[2]);

    reflectionMat[3] = 0;
    reflectionMat[7] = 0;
    reflectionMat[11] = 0;
    reflectionMat[15] = 1;

    return reflectionMat;
}

async function loadTexture(fileName) {
    return await createImageBitmap(await (await fetch("images/" + fileName)).blob());
}

const cubemap = app.createCubemap({
    negX: await loadTexture("nx.png"),
    posX: await loadTexture("ny.png"),
    negY: await loadTexture("nz.png"),
    posY: await loadTexture("px.png"),
    negZ: await loadTexture("py.png"),
    posZ: await loadTexture("pz.png")
});
//A draw call is a call to the graphics API to draw objects 
let drawCall = app.createDrawCall(program, vertexArray)
    .texture("cubemap", cubemap);
    
    

let skyboxDrawCall = app.createDrawCall(skyboxProgram, skyboxArray)
    .texture("cubemap", cubemap);

    const tex = await loadTexture("darth.jpg"); //NOT WORKING
    let mirrorDrawCall = app.createDrawCall(mirrorProgram, mirrorArray)
        .texture("reflectionTex", reflectionColorTarget)
        .texture("distortionMap", app.createTexture2D(tex, tex.width, tex.height, {
            magFilter: PicoGL.LINEAR,
            minFilter: PicoGL.LINEAR,
            maxAnisotropy: 10,
            wrapS: PicoGL.MIRRORED_REPEAT,
            wrapT: PicoGL.MIRRORED_REPEAT
        }));

    const positionsBuffer = new Float32Array(numberOfLights * 3);
    const colorsBuffer = new Float32Array(numberOfLights * 3);

    function renderReflectionTexture()
{
    app.drawFramebuffer(reflectionBuffer);
    app.viewport(0, 0, reflectionColorTarget.width, reflectionColorTarget.height);
    app.gl.cullFace(app.gl.FRONT);

    let reflectionMatrix = calculateSurfaceReflectionMatrix(mat4.create(), mirrorModelMatrix, vec3.fromValues(0, 1, 0));
    let reflectionViewMatrix = mat4.mul(mat4.create(), viewMatrix, reflectionMatrix);
    let reflectionCameraPosition = vec3.transformMat4(vec3.create(), cameraPosition, reflectionMatrix);
    drawObjects(reflectionCameraPosition, reflectionViewMatrix);

    app.gl.cullFace(app.gl.BACK);
    app.defaultDrawFramebuffer();
    app.defaultViewport();
}

function drawObjects(cameraPosition, viewMatrix) {
    mat4.multiply(viewProjMatrix, projMatrix, viewMatrix);

    mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
    mat4.multiply(modelViewProjectionMatrix, viewProjMatrix, modelMatrix);

    let skyboxViewProjectionMatrix = mat4.create();
    mat4.mul(skyboxViewProjectionMatrix, projMatrix, viewMatrix);
    mat4.invert(skyboxViewProjectionInverse, skyboxViewProjectionMatrix);

    app.clear();

    app.disable(PicoGL.DEPTH_TEST);
    app.disable(PicoGL.CULL_FACE);
    skyboxDrawCall.uniform("viewProjectionInverse", skyboxViewProjectionInverse);
    skyboxDrawCall.draw();

    app.enable(PicoGL.DEPTH_TEST);
    app.enable(PicoGL.CULL_FACE);
    drawCall.uniform("modelViewProjectionMatrix", modelViewProjectionMatrix);
    drawCall.uniform("cameraPosition", cameraPosition);
    drawCall.uniform("modelMatrix", modelMatrix);
    drawCall.uniform("normalMatrix", mat3.normalFromMat4(mat3.create(), modelMatrix));
    drawCall.draw();
}

function drawMirror() {
    mat4.multiply(mirrorModelViewProjectionMatrix, viewProjMatrix, mirrorModelMatrix);
    mirrorDrawCall.uniform("modelViewProjectionMatrix", mirrorModelViewProjectionMatrix);
    mirrorDrawCall.uniform("screenSize", vec2.fromValues(app.width, app.height))
    mirrorDrawCall.draw();
}

function draw(timems) {
    let time = timems / 1000;

    mat4.perspective(projMatrix, Math.PI / 2.5, 2.0 * app.width / app.height, 15, 100.0);
    vec3.rotateY(cameraPosition, vec3.fromValues(45, 0, 3.4), vec3.fromValues(0, 0, 0), time * 0.05);
    mat4.lookAt(viewMatrix, cameraPosition, vec3.fromValues(0, -0.5, 0), vec3.fromValues(0, 1, 0));

    for (let i = 0; i < numberOfLights; i++) {
        vec3.rotateZ(pointLightPositions[i], pointLightInitialPositions[i], vec3.fromValues(0, 0, 0), time);
        positionsBuffer.set(pointLightPositions[i], i * 3);
        
        colorsBuffer.set(pointLightColors[i], i * 3);
    }

    drawCall.uniform("lightPositions[0]", positionsBuffer);
    drawCall.uniform("lightColors[0]", colorsBuffer);

   
    mat4.mul(modelMatrix, rotateXMatrix, rotateYMatrix);

    
    mat4.fromYRotation(rotateYMatrix, time * 0.2354);
    mat4.mul(mirrorModelMatrix, rotateYMatrix, rotateXMatrix);
    mat4.translate(mirrorModelMatrix, mirrorModelMatrix, vec3.fromValues(0, -1, 0));

    renderReflectionTexture();
    drawObjects(cameraPosition, viewMatrix);
    drawMirror();

    requestAnimationFrame(draw);

    

   
}

requestAnimationFrame(draw);