import os
import glob

# Rename file
if os.path.exists('projects.html'):
    os.rename('projects.html', 'services.html')

# Get all html files, sw.js, and sitemap.xml
files = glob.glob('*.html') + ['sw.js', 'sitemap.xml']

for f in files:
    if not os.path.exists(f): continue
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Replace links
    content = content.replace('projects.html', 'services.html')
    content = content.replace('> Projects</a>', '> Services</a>')
    content = content.replace('>Projects</a>', '>Services</a>')
    content = content.replace('Projects   Technoid Portfolio', 'Services   Technoid Portfolio')
    content = content.replace('Projects - Technoid Portfolio', 'Services - Technoid Portfolio')
    content = content.replace('Projects — Technoid Portfolio', 'Services — Technoid Portfolio')
    content = content.replace('Engineering Hub   Technoid Portfolio', 'Services   Technoid Portfolio')
    content = content.replace('Engineering Hub - Technoid Portfolio', 'Services - Technoid Portfolio')
    content = content.replace('Engineering Hub — Technoid Portfolio', 'Services — Technoid Portfolio')
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("Done")
