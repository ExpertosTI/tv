import AppKit
import CoreGraphics
import Foundation

let root = URL(fileURLWithPath: "/Users/brainiacx/APPS/www.renace.tech/pantalla", isDirectory: true)
let navy = CGColor(red: 0, green: 32.0 / 255, blue: 78.0 / 255, alpha: 1)
let white = CGColor(red: 1, green: 1, blue: 1, alpha: 1)

func context(width: Int, height: Int) -> CGContext {
    let space = CGColorSpaceCreateDeviceRGB()
    let ctx = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: space,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!
    ctx.translateBy(x: 0, y: CGFloat(height))
    ctx.scaleBy(x: 1, y: -1)
    return ctx
}

func drawArrow(ctx: CGContext, rect: CGRect) {
    ctx.saveGState()
    ctx.translateBy(x: rect.midX, y: rect.midY)
    ctx.rotate(by: -.pi / 4)
    let side = min(rect.width, rect.height)
    let shaft = side * 0.62
    let thick = side * 0.20
    let head = side * 0.36
    let path = CGMutablePath()
    path.move(to: CGPoint(x: -shaft / 2, y: -thick / 2))
    path.addLine(to: CGPoint(x: shaft / 2 - head * 0.55, y: -thick / 2))
    path.addLine(to: CGPoint(x: shaft / 2 - head * 0.55, y: -head / 2))
    path.addLine(to: CGPoint(x: shaft / 2, y: 0))
    path.addLine(to: CGPoint(x: shaft / 2 - head * 0.55, y: head / 2))
    path.addLine(to: CGPoint(x: shaft / 2 - head * 0.55, y: thick / 2))
    path.addLine(to: CGPoint(x: -shaft / 2, y: thick / 2))
    path.closeSubpath()
    ctx.setFillColor(white)
    ctx.addPath(path)
    ctx.fillPath()
    ctx.restoreGState()
}

func writePNG(_ ctx: CGContext, to url: URL) {
    let image = ctx.makeImage()!
    let rep = NSBitmapImageRep(cgImage: image)
    let data = rep.representation(using: .png, properties: [:])!
    try! FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try! data.write(to: url)
}

func icon(size: Int, url: URL) {
    let ctx = context(width: size, height: size)
    ctx.setFillColor(navy)
    ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
    let inset = CGFloat(size) * 0.22
    drawArrow(ctx: ctx, rect: CGRect(x: inset, y: inset, width: CGFloat(size) - inset * 2, height: CGFloat(size) - inset * 2))
    writePNG(ctx, to: url)
}

func banner(width: Int, height: Int, url: URL, titleSize: CGFloat) {
    let ctx = context(width: width, height: height)
    ctx.setFillColor(navy)
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    let arrowSide = CGFloat(height) * 0.62
    drawArrow(
        ctx: ctx,
        rect: CGRect(x: CGFloat(width) * 0.08, y: (CGFloat(height) - arrowSide) / 2, width: arrowSide, height: arrowSide)
    )
    let graphics = NSGraphicsContext(cgContext: ctx, flipped: true)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = graphics
    let brand = NSAttributedString(
        string: "RENACE",
        attributes: [
            .font: NSFont(name: "Helvetica-Bold", size: titleSize * 0.42)!,
            .foregroundColor: NSColor(calibratedRed: 143 / 255, green: 211 / 255, blue: 1, alpha: 1),
            .kern: 3,
        ]
    )
    let name = NSAttributedString(
        string: "Pantalla",
        attributes: [
            .font: NSFont(name: "Helvetica-Bold", size: titleSize)!,
            .foregroundColor: NSColor.white,
        ]
    )
    let textX = CGFloat(width) * 0.34
    brand.draw(at: NSPoint(x: textX, y: CGFloat(height) * 0.30))
    name.draw(at: NSPoint(x: textX, y: CGFloat(height) * 0.44))
    NSGraphicsContext.restoreGraphicsState()
    writePNG(ctx, to: url)
}

let res = root.appendingPathComponent("android/app/src/main/res")
let densities = [
    ("mipmap-mdpi", 48),
    ("mipmap-hdpi", 72),
    ("mipmap-xhdpi", 96),
    ("mipmap-xxhdpi", 144),
    ("mipmap-xxxhdpi", 192),
]
for (folder, size) in densities {
    icon(size: size, url: res.appendingPathComponent("\(folder)/ic_launcher.png"))
}
icon(size: 512, url: root.appendingPathComponent("play-store/icon-512.png"))
icon(size: 1024, url: root.appendingPathComponent("play-store/icon-1024.png"))
banner(width: 320, height: 180, url: res.appendingPathComponent("drawable-xhdpi/tv_banner.png"), titleSize: 36)
banner(width: 320, height: 180, url: root.appendingPathComponent("play-store/tv-banner-320x180.png"), titleSize: 36)
banner(width: 1024, height: 500, url: root.appendingPathComponent("play-store/feature-1024x500.png"), titleSize: 92)
print("icons ok")
