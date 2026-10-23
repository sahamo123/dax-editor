# Application-owned bounded motion templates. User content is JSON data, never Python source.
import bpy
import json
import math
import os
import sys
import textwrap

with open(sys.argv[sys.argv.index("--") + 1], encoding="utf-8") as source:
    p = json.load(source)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 8
# Optional denoising is absent from some supported system builds; these bounded templates must render without it.
scene.cycles.use_denoising = False
scene.render.resolution_x = p["width"]
scene.render.resolution_y = p["height"]
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.fps = p["fps"]
scene.frame_start = 1
scene.frame_end = max(1, round(p["duration"] * p["fps"]))
scene.world.color = (0.035, 0.045, 0.07)
scene.render.threads_mode = "FIXED"
scene.render.threads = 2

bpy.ops.object.camera_add(location=(0, 0, 10))
scene.camera = bpy.context.object
scene.camera.data.type = "ORTHO"
scene.camera.data.ortho_scale = 8

bpy.ops.object.light_add(type="AREA", location=(0, 2, 6))
bpy.context.object.data.energy = 800
bpy.context.object.data.shape = "DISK"
bpy.context.object.data.size = 5

bpy.ops.object.text_add(location=(0, -1.4 if p["template"] == "logo-intro" else 0, 0))
title = bpy.context.object
title.data.body = textwrap.fill(p["text"], width=25)
title.data.align_x = "CENTER"
title.data.align_y = "CENTER"
title.data.extrude = 0.13 if p["template"] == "text-3d" else 0.01
title.data.bevel_depth = 0.015
color = p["color"].lstrip("#")
rgba = tuple(int(color[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (1,)
material = bpy.data.materials.new("Title color")
material.diffuse_color = rgba
title.data.materials.append(material)
bpy.context.view_layer.update()
scale = min(1, 6.5 / max(title.dimensions.x, 0.1), 3 / max(title.dimensions.y, 0.1))
title.scale = (scale * 0.1,) * 3
title.keyframe_insert(data_path="scale", frame=1)
title.scale = (scale,) * 3
title.keyframe_insert(data_path="scale", frame=min(scene.frame_end, max(2, p["fps"] // 2)))
if p["template"] == "text-3d":
    title.rotation_euler.y = math.radians(22)
    title.keyframe_insert(data_path="rotation_euler", frame=1)
    title.rotation_euler.y = math.radians(-12)
    title.keyframe_insert(data_path="rotation_euler", frame=scene.frame_end)

if p["template"] == "logo-intro":
    image = bpy.data.images.load(p["logoPath"])
    bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 1, 0))
    logo = bpy.context.object
    logo.scale.x = image.size[0] / max(image.size[1], 1)
    logo.scale *= min(1, 2.5 / max(logo.scale.x, 1))
    surface = bpy.data.materials.new("Logo image")
    surface.use_nodes = True
    texture = surface.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    shader = surface.node_tree.nodes.get("Principled BSDF")
    surface.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    logo.data.materials.append(surface)

for frame in range(scene.frame_start, scene.frame_end + 1):
    scene.frame_set(frame)
    scene.render.filepath = os.path.join(p["frames"], "frame_%04d.png" % frame)
    bpy.ops.render.render(write_still=True)
    print("DAX_FRAME %d/%d" % (frame, scene.frame_end), flush=True)
