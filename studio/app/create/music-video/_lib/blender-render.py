"""Trusted Blender renderer. The AI provides bounded JSON parameters, never code."""
import bpy
import json
import math
import sys
from pathlib import Path

job = json.loads(Path(sys.argv[sys.argv.index("--") + 1]).read_text())
plan = job["plan"]
scene = bpy.context.scene
scene.render.fps = 30
scene.frame_start = 1
scene.frame_end = max(1, round(job["duration"] * 30))
scene.render.resolution_x = job["width"]
scene.render.resolution_y = job["height"]
scene.render.resolution_percentage = 100
scene.render.use_sequencer = True
scene.render.use_compositing = False
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
if hasattr(scene.render.image_settings, "media_type"):
    scene.render.image_settings.media_type = "VIDEO"
scene.render.image_settings.file_format = "FFMPEG"
scene.render.ffmpeg.format = "MPEG4"
scene.render.ffmpeg.codec = "H264"
scene.render.ffmpeg.constant_rate_factor = "HIGH"
scene.render.ffmpeg.ffmpeg_preset = "GOOD"
scene.render.ffmpeg.audio_codec = "AAC"
scene.render.ffmpeg.audio_bitrate = 256
scene.render.ffmpeg.audio_mixrate = 44100
scene.render.filepath = job["output"]
editor = scene.sequence_editor_create()
strips = editor.strips
clip = strips.new_movie("Original AI video", job["input"], channel=1, frame_start=1)
clip.color_saturation = plan["saturation"]
contrast = clip.modifiers.new("AI contrast", "BRIGHT_CONTRAST")
contrast.bright = plan["brightness"]
contrast.contrast = plan["contrast"]
balance = clip.modifiers.new("AI colour temperature", "COLOR_BALANCE")
balance.color_balance.gain = (1 + plan["warmth"], 1, 1 - plan["warmth"])
strips.new_sound("Original vocal soundtrack", job["audio"], channel=2, frame_start=1)
# Subtle zoom on a tempo grid; source timing and the original performance stay intact.
beat = 30 * 60 / plan["bpm"]
frame = 1.0
while frame <= scene.frame_end + beat:
    for offset, amount in [(0, plan["zoom"] + plan["pulse"]), (beat * .4, plan["zoom"])]:
        clip.transform.scale_x = amount
        clip.transform.scale_y = amount
        clip.transform.keyframe_insert("scale_x", frame=frame + offset)
        clip.transform.keyframe_insert("scale_y", frame=frame + offset)
    frame += beat
if plan["glow"] > 0:
    glow = strips.new_effect("AI highlight glow", type="GLOW", channel=3, frame_start=1, length=scene.frame_end, input1=clip)
    glow.threshold = .85
    glow.boost_factor = plan["glow"]
    glow.blur_radius = 6
for index, caption in enumerate(plan["captions"]):
    start = 1 + round(caption["start"] * 30)
    end = min(scene.frame_end + 1, 1 + round(caption["end"] * 30))
    if end <= start:
        continue
    text = strips.new_effect(f"English lyric {index + 1}", type="TEXT", channel=4, frame_start=start, length=end - start)
    text.text = caption["text"]
    text.font_size = max(20, round(job["height"] * .047))
    text.location = (.5, .11)
    text.alignment_x = "CENTER"
    text.anchor_x = "CENTER"
    text.anchor_y = "CENTER"
    text.wrap_width = .85
    text.use_bold = True
    text.use_shadow = True
    text.use_box = True
    text.box_color = (0, 0, 0, .38)
    text.box_margin = .018
scene.frame_set(1)
# Save the editable project before rendering; original footage remains separate.
bpy.ops.wm.save_as_mainfile(filepath=job["blend"])
bpy.ops.render.render(animation=True)
print("KRIYA_BLENDER_COMPLETE", flush=True)
