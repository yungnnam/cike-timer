# -*- coding: utf-8 -*-
"""把 app/ 打包成一个可以离线安装的 APK —— 不需要 Gradle，也不需要 Android Studio。

链路：aapt2 编译资源 → aapt2 链接出基础 APK（assets 一起打进去）→ javac 编译 Java
（含 aapt2 生成的 R.java）→ d8 转 dex → 塞进 APK → zipalign 对齐 → apksigner 签名。

需要三样东西（都能从 Android SDK 的命令行工具里拿到，不需要 Studio）：
  build-tools（aapt2 / d8 / zipalign / apksigner）
  platforms/android-34/android.jar
  JDK 11 以上（javac / keytool）

用环境变量指出它们的位置：
  CIKE_BT        build-tools 目录（例如 …/build-tools/37.0.0）
  CIKE_PLATFORM  platforms/android-34 目录
  CIKE_JDK       JDK 根目录（可选，默认用 PATH 里的 java 反推）
  CIKE_BUILD     临时构建目录（可选，默认系统临时目录）

用法：
  python android/build_apk.py
产物：
  dist/cike-<versionName>.apk（版本号从 android/AndroidManifest.xml 读）

注意：aapt2 在 Windows 上打不开含中文的路径，所以脚本会先把所有输入复制到
CIKE_BUILD（默认 %TEMP%\\cike-build，纯 ASCII）里再构建，最后把 APK 复制到 dist/。
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
APP = os.path.join(REPO, 'app')
SRC = HERE                                    # AndroidManifest.xml / java / res
DIST = os.path.join(REPO, 'dist')
MANIFEST = os.path.join(SRC, 'AndroidManifest.xml')

WIN = os.name == 'nt'
EXE = '.exe' if WIN else ''
BAT = '.bat' if WIN else ''

WORK = os.environ.get('CIKE_BUILD') or os.path.join(tempfile.gettempdir(), 'cike-build')
ANDROID_JAR = os.path.join(WORK, 'android.jar')
KEYSTORE = os.path.join(WORK, 'cike.keystore')
KS_PASS = 'cike2026'
KS_ALIAS = 'cike'
OUT_APK = os.path.join(WORK, 'cike-unsigned.apk')
ALIGNED = os.path.join(WORK, 'cike-aligned.apk')
SIGNED = os.path.join(WORK, 'cike.apk')

MIN_SDK = '24'
TARGET_SDK = '34'


def die(msg):
    raise SystemExit('错误：' + msg)


def read_manifest():
    with open(MANIFEST, encoding='utf-8') as f:
        text = f.read()
    def one(pat, default):
        m = re.search(pat, text)
        return m.group(1) if m else default
    return (
        one(r'android:versionCode="([^"]+)"', '1'),
        one(r'android:versionName="([^"]+)"', '0.1'),
        one(r'package="([^"]+)"', 'cn.cike.timer'),
    )


def find_bt():
    p = os.environ.get('CIKE_BT')
    if p and os.path.isdir(p):
        return p
    # 有 ANDROID_HOME 时自动挑一个最新的 build-tools
    for base in filter(None, [os.environ.get('ANDROID_HOME'), os.environ.get('ANDROID_SDK_ROOT')]):
        d = os.path.join(base, 'build-tools')
        if not os.path.isdir(d):
            continue
        cands = sorted(os.listdir(d), reverse=True)
        for name in cands:
            full = os.path.join(d, name)
            if os.path.exists(os.path.join(full, 'aapt2' + EXE)):
                return full
    die('找不到 build-tools，请设置 CIKE_BT（例如 C:/android/build-tools/37.0.0）')


def find_platform():
    p = os.environ.get('CIKE_PLATFORM')
    if p and os.path.exists(os.path.join(p, 'android.jar')):
        return os.path.join(p, 'android.jar')
    for base in filter(None, [os.environ.get('ANDROID_HOME'), os.environ.get('ANDROID_SDK_ROOT')]):
        for name in ('android-34', 'android-35', 'android-33'):
            cand = os.path.join(base, 'platforms', name, 'android.jar')
            if os.path.exists(cand):
                return cand
    die('找不到 android.jar，请设置 CIKE_PLATFORM（例如 C:/android/platforms/android-34）')


def find_jdk():
    p = os.environ.get('CIKE_JDK')
    if p:
        return p
    java = shutil.which('java')
    if not java:
        die('找不到 java，请设置 CIKE_JDK（JDK 根目录）')
    if os.path.islink(java):
        java = os.path.realpath(java)
    return os.path.dirname(os.path.dirname(java))


BT = find_bt()
ANDROID_JAR_SRC = find_platform()
JDK = find_jdk()
JAVAC = os.path.join(JDK, 'bin', 'javac' + EXE)
KEYTOOL = os.path.join(JDK, 'bin', 'keytool' + EXE)
AAPT2 = os.path.join(BT, 'aapt2' + EXE)
D8 = os.path.join(BT, 'd8' + BAT)
ZIPALIGN = os.path.join(BT, 'zipalign' + EXE)
APKSIGNER = os.path.join(BT, 'apksigner' + BAT)


def run(cmd, cwd=None, env=None, quiet=False):
    if not quiet:
        print('  $ ' + ' '.join(os.path.basename(c) for c in cmd[:2]) + ' …')
    p = subprocess.run(cmd, cwd=cwd or WORK, env=env, capture_output=True,
                       text=True, encoding='utf-8', errors='replace')
    out = (p.stdout or '') + (p.stderr or '')
    if p.returncode != 0:
        print(out[-4000:])
        die('命令失败：' + ' '.join(cmd[:2]))
    return out


def step(msg):
    print('\n== ' + msg)


def prepare():
    for p, what in ((AAPT2, 'aapt2'), (D8, 'd8'), (ZIPALIGN, 'zipalign'),
                    (APKSIGNER, 'apksigner'), (JAVAC, 'javac'), (KEYTOOL, 'keytool')):
        if not os.path.exists(p):
            die('缺少 %s（%s）' % (what, p))
    if os.path.isdir(WORK):
        shutil.rmtree(WORK)
    os.makedirs(WORK)
    shutil.copy2(ANDROID_JAR_SRC, ANDROID_JAR)
    shutil.copytree(os.path.join(SRC, 'res'), os.path.join(WORK, 'res'))
    shutil.copytree(os.path.join(SRC, 'java'), os.path.join(WORK, 'java'))
    shutil.copy2(MANIFEST, os.path.join(WORK, 'AndroidManifest.xml'))

    assets = os.path.join(WORK, 'assets', 'www')
    os.makedirs(assets)
    for name in os.listdir(APP):
        if name.endswith('.apk'):
            continue
        s = os.path.join(APP, name)
        d = os.path.join(assets, name)
        if os.path.isdir(s):
            shutil.copytree(s, d)
        else:
            shutil.copy2(s, d)
    print('  工作目录：' + WORK)


def gen_icons():
    try:
        from PIL import Image
    except ImportError:
        print('  跳过图标缩放（没有 Pillow，用 res 里已有的 mipmap）')
        return
    src = Image.open(os.path.join(APP, 'icons', 'icon-512.png')).convert('RGBA')
    for dpi, size in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96),
                      ('xxhdpi', 144), ('xxxhdpi', 192)):
        d = os.path.join(WORK, 'res', 'mipmap-' + dpi)
        os.makedirs(d, exist_ok=True)
        src.resize((size, size), Image.LANCZOS).save(os.path.join(d, 'ic_launcher.png'))
    print('  图标：48 / 72 / 96 / 144 / 192')


def build(vcode, vname):
    step('aapt2 编译资源')
    run([AAPT2, 'compile', '--dir', 'res', '-o', 'res.zip'])

    step('aapt2 链接 APK（assets 一起打进去）')
    run([AAPT2, 'link', '-o', 'cike-unsigned.apk', '--manifest', 'AndroidManifest.xml',
         '-I', 'android.jar', '-A', 'assets', '--java', os.path.join(WORK, 'gen'),
         '--min-sdk-version', MIN_SDK, '--target-sdk-version', TARGET_SDK,
         '--version-code', str(vcode), '--version-name', vname, 'res.zip'])

    step('javac 编译 Java（含 R.java）')
    clsdir = os.path.join(WORK, 'classes')
    os.makedirs(clsdir, exist_ok=True)
    sources = []
    for root in (os.path.join(WORK, 'java'), os.path.join(WORK, 'gen')):
        for base, _dirs, names in os.walk(root):
            sources += [os.path.join(base, n) for n in names if n.endswith('.java')]
    sources.sort()
    print('  %d 个源文件' % len(sources))
    run([JAVAC, '--release', '11', '-encoding', 'UTF-8', '-cp', ANDROID_JAR, '-d', clsdir] + sources)

    step('d8 转 dex')
    dexdir = os.path.join(WORK, 'dex')
    os.makedirs(dexdir, exist_ok=True)
    classes = []
    for base, _dirs, names in os.walk(clsdir):
        classes += [os.path.join(base, n) for n in names if n.endswith('.class')]
    run([D8, '--release', '--min-api', MIN_SDK, '--lib', ANDROID_JAR, '--output', dexdir] + classes)

    step('把 dex 塞进 APK')
    with zipfile.ZipFile(OUT_APK, 'a', zipfile.ZIP_DEFLATED) as z:
        z.write(os.path.join(dexdir, 'classes.dex'), 'classes.dex')
    with zipfile.ZipFile(OUT_APK) as z:
        names = z.namelist()
    if 'classes.dex' not in names:
        die('classes.dex 没进包')
    print('  APK 条目 %d 个' % len(names))

    step('zipalign 对齐')
    if os.path.exists(ALIGNED):
        os.remove(ALIGNED)
    run([ZIPALIGN, '-p', '-f', '4', OUT_APK, ALIGNED])

    step('签名')
    env = dict(os.environ)
    env['JAVA_HOME'] = JDK
    if not os.path.exists(KEYSTORE):
        run([KEYTOOL, '-genkeypair', '-v', '-keystore', KEYSTORE, '-alias', KS_ALIAS,
             '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10800',
             '-storepass', KS_PASS, '-keypass', KS_PASS,
             '-dname', 'CN=Cike, OU=Cike, O=Cike, C=CN'], env=env)
    if os.path.exists(SIGNED):
        os.remove(SIGNED)
    run([APKSIGNER, 'sign', '--ks', KEYSTORE, '--ks-key-alias', KS_ALIAS,
         '--ks-pass', 'pass:' + KS_PASS, '--key-pass', 'pass:' + KS_PASS,
         '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true',
         '--out', SIGNED, ALIGNED], env=env)
    print(run([APKSIGNER, 'verify', '--verbose', SIGNED], env=env, quiet=True)[-300:])

    step('产物')
    os.makedirs(DIST, exist_ok=True)
    final = os.path.join(DIST, 'cike-%s.apk' % vname)
    shutil.copy2(SIGNED, final)
    print('  %s  %.0f KB' % (final, os.path.getsize(final) / 1024))


def main():
    vcode, vname, pkg = read_manifest()
    print('打包 %s  versionCode=%s  versionName=%s' % (pkg, vcode, vname))
    print('build-tools: %s' % BT)
    print('android.jar: %s' % ANDROID_JAR_SRC)
    print('JDK:         %s' % JDK)
    prepare()
    gen_icons()
    build(vcode, vname)


if __name__ == '__main__':
    main()
