import AppIntents
import Foundation

// SiteMath：坡度/直角三角形的三个量在同一套公式里，跟 App 内 20 个工具用的是同一组关系式。
// 只做「纯算术」意图，不猜业务假设，避免与 App 内结果不一致。
@available(iOS 16.0, *)
struct SlopeIntent: AppIntent {
  static var title: LocalizedStringResource = "Slope from rise and run"
  static var description: IntentDescription? = IntentDescription(
    "Turns a rise-over-run measurement into pitch in degrees, slope in percent, and the diagonal length."
  )
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Rise", description: "Vertical change, same unit as run.")
  var rise: Double

  @Parameter(title: "Run", description: "Horizontal change, same unit as rise.")
  var run: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Slope for \(\.$rise) rise over \(\.$run) run")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard run != 0 else {
      return .result(dialog: "Run can't be zero — that's a vertical line.")
    }
    let ratio = abs(rise / run)
    let degrees = atan(ratio) * 180 / .pi
    let percent = ratio * 100
    let diagonal = (rise * rise + run * run).squareRoot()
    let d = String(format: "%.1f", degrees)
    let p = String(format: "%.1f", percent)
    let g = String(format: "%.2f", diagonal)
    return .result(dialog: "Pitch \(d)°, slope \(p)%, diagonal \(g).")
  }
}

@available(iOS 16.0, *)
struct OpenSiteMathIntent: AppIntent {
  static var title: LocalizedStringResource = "Open SiteMath"
  static var description: IntentDescription? = IntentDescription(
    "Opens SiteMath's calculators: pipe grades, offsets, electrical and gas tables."
  )
  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    return .result()
  }
}

@available(iOS 16.0, *)
struct SiteMathShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: SlopeIntent(),
      phrases: [
        "Calculate slope in \(.applicationName)",
        "What pitch is that grade in \(.applicationName)",
      ],
      shortTitle: "Slope",
      systemImageName: "ruler"
    )
    AppShortcut(
      intent: OpenSiteMathIntent(),
      phrases: ["Open \(.applicationName)"],
      shortTitle: "Open SiteMath",
      systemImageName: "function"
    )
  }
}


