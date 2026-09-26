import SwiftUI
import WebKit
import AVKit
import Combine

struct Picture: Identifiable, Codable {
    var id: String
    var name: String
    var file: String
    var description: String
    var kind: String
}

@MainActor final class Studio: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate {
    @Published var pictures: [Picture] = []
    @Published var dropTargeted = false
    @Published var vocalLyrics = ""
    @Published var cueState = ""
    @Published var cueMessage = ""
    @Published var activePicture = ""
    @Published var cueRequest = ""
    @Published var ready = false
    @Published var phase = "stopped"
    @Published var busy = false
    @Published var importing = false
    @Published var message = "Connecting to your Mac… Pictures are ready to load."
    @Published var seconds: Double = 0
    @Published var output: URL?
    @Published var player: AVPlayer?
    @Published var idea = "Create a one-minute, high-energy English rap music video. An original rapper performs on a San Francisco waterfront promenade, with the Golden Gate Bridge behind him in warm morning light. The song celebrates YC founders: bold ideas, building fast, learning from failure, and making something people want. Use punchy drums, deep bass, clever original rhymes, and a catchy “build, launch, repeat” hook. Keep the rapper visible as the camera moves smoothly around him"
    @Published var style = "High-energy rap"
    @Published var address = UserDefaults.standard.string(forKey: "server") ?? "http://127.0.0.1:3211"
    let web: WKWebView
    let folder = URL.documentsDirectory.appending(path: "Pictures")
    var running: Bool { phase == "playing" || phase == "connecting" }
    override init() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        web = WKWebView(frame: .zero, configuration: config)
        super.init()
        web.isOpaque = false; web.backgroundColor = .black
        web.scrollView.isScrollEnabled = false
        web.navigationDelegate = self
        config.userContentController.add(self, name: "studio")
        loadPictures()
        connect()
    }
    func connect() {
        guard let url = URL(string: address), ["http", "https"].contains(url.scheme), url.host != nil else {
            message = "Enter a complete Mac studio address."; return
        }
        ready = false
        UserDefaults.standard.set(address, forKey: "server")
        web.load(URLRequest(url: url.appending(path: "create/music-video/native")))
    }
    func loadPictures() {
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let entries: [(String, String, String, String)] = [
                ("ocean", "Ocean", "An endless deep blue ocean with turquoise waves", "location"),
                ("tiger", "Tiger", "A Bengal tiger swimming in the foreground, striped shoulders and head above water", "subject"),
                ("sunset", "Sunset", "Warm amber sunset, golden reflections and cinematic haze", "atmosphere"),
                ("city", "City", "A neon city at night, reflected in rain-soaked streets", "location")]
            pictures = entries.map { id, name, description, kind in
                let dest = folder.appending(path: "\(id).jpg")
                if !FileManager.default.fileExists(atPath: dest.path), let source = Bundle.main.url(forResource: id, withExtension: "jpg") { try? FileManager.default.copyItem(at: source, to: dest) }
                return Picture(id: id, name: name, file: "\(id).jpg", description: description, kind: kind)
            }
            if let data = try? Data(contentsOf: folder.appending(path: "library.json")), let saved = try? JSONDecoder().decode([Picture].self, from: data) { pictures += saved }
            let last = URL.documentsDirectory.appending(path: "Music Video.mp4")
            if FileManager.default.fileExists(atPath: last.path) { output = last }
        } catch { message = "Could not open your picture library: \(error.localizedDescription)" }
    }
    func image(_ picture: Picture) -> UIImage? { UIImage(contentsOfFile: folder.appending(path: picture.file).path) }
    func add(_ data: Data, name: String) {
        guard data.count <= 30_000_000, let source = UIImage(data: data) else { message = "Choose a picture smaller than 30 MB."; return }
        let ratio = min(1, 1200 / max(source.size.width, source.size.height))
        let size = CGSize(width: source.size.width * ratio, height: source.size.height * ratio)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in source.draw(in: CGRect(origin: .zero, size: size)) }
        guard let jpeg = resized.jpegData(compressionQuality: 0.85) else { message = "This picture could not be opened."; return }
        let id = UUID().uuidString
        do {
            try jpeg.write(to: folder.appending(path: "\(id).jpg"), options: .atomic)
            pictures.append(Picture(id: id, name: name, file: "\(id).jpg", description: name, kind: "subject"))
            try JSONEncoder().encode(Array(pictures.dropFirst(4))).write(to: folder.appending(path: "library.json"), options: .atomic)
            message = "Picture loaded. Tap or drag it when your video is playing."
        } catch { message = "Could not save the picture: \(error.localizedDescription)" }
    }
    func importFiles(_ urls: [URL]) {
        for url in urls {
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            do { add(try Data(contentsOf: url), name: url.deletingPathExtension().lastPathComponent) }
            catch { message = "Could not read \(url.lastPathComponent). Try a JPG or PNG." }
        }
    }
    func command(_ script: String, _ arguments: [String: Any] = [:]) {
        Task {
            do { _ = try await web.callAsyncJavaScript(script, arguments: arguments, in: nil, contentWorld: .page) }
            catch { message = error.localizedDescription; if cueState == "pending" { rejectCue("Could not send that picture. Try again.") }; if phase == "connecting" { phase = "stopped" } }
        }
    }

    func start() {
        guard ready, !busy, !running, !idea.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        player?.pause(); player = nil; seconds = 0; cueState = ""; vocalLyrics = ""; activePicture = ""; phase = "connecting"
        command("await window.kriyaNative.start(idea, style)", ["idea": idea, "style": style])
    }
    func stop() { command("window.kriyaNative.stop()") }
    func steer(_ picture: Picture) {
        guard phase == "playing" else { rejectCue("Start your video first, then tap or drag a picture."); return }
        guard cueState != "pending" else { return }
        beginCue(picture.name, id: picture.id)
        var image = "/create/music-video/\(picture.id).jpg"
        if !["ocean", "tiger", "sunset", "city"].contains(picture.id), let data = try? Data(contentsOf: folder.appending(path: picture.file)) { image = "data:image/jpeg;base64," + data.base64EncodedString() }
        command("await window.kriyaNative.cue(cue)", ["cue": ["requestId": cueRequest, "id": picture.id, "name": picture.name, "image": image, "description": picture.description, "kind": picture.kind, "music": style]])

    }
    func steer(text: String) {
        if let picture = pictures.first(where: { $0.id == text }) { steer(picture); return }
        guard phase == "playing", !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard cueState != "pending" else { return }
        beginCue("Your direction", id: "")
        command("await window.kriyaNative.cue(cue)", ["cue": ["requestId": cueRequest, "id": UUID().uuidString, "name": text, "image": "/create/music-video/ocean.jpg", "description": text, "kind": "atmosphere", "music": style]])
    }
    func rejectCue(_ text: String) {
        cueState = "failed"; cueMessage = text; message = text
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
        UIAccessibility.post(notification: .announcement, argument: text)
    }
    private func beginCue(_ name: String, id: String) {
        cueRequest = UUID().uuidString; activePicture = id; cueState = "pending"
        cueMessage = "\(name) received — sending to the scene…"
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        UIAccessibility.post(notification: .announcement, argument: cueMessage)
    }
    func refine(_ text: String) { player?.pause(); command("await window.kriyaNative.refine(direction)", ["direction": text]) }
    func demo() {
        if let url = Bundle.main.url(forResource: "Demo", withExtension: "mp4") { player = AVPlayer(url: url); player?.play() }
    }
    func watch() { if let output { player = AVPlayer(url: output); player?.play() } }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        if let state = body["cueState"] as? String, let request = body["requestId"] as? String, request == cueRequest {
            cueState = state; cueMessage = body["cueMessage"] as? String ?? ""
            if state != "pending" {
                UINotificationFeedbackGenerator().notificationOccurred(state == "accepted" ? .success : .error)
                UIAccessibility.post(notification: .announcement, argument: cueMessage)
            }
        }
        if let lines = body["vocalLyrics"] as? [String] { vocalLyrics = lines.joined(separator: "\n") }
        if let value = body["ready"] as? Bool { ready = value }
        if let value = body["phase"] as? String { phase = value }
        if let value = body["busy"] as? Bool { busy = value }
        if let value = body["time"] as? Double { seconds = value }
        if let value = body["message"] as? String { self.message = value }
        if let value = body["error"] as? String { self.message = value; if phase == "connecting" { phase = "stopped" } }
        if let path = body["finished"] as? String { Task { await download(path) } }
    }
    func download(_ path: String) async {
        guard let url = URL(string: path, relativeTo: URL(string: address))?.absoluteURL else { return }
        do {
            let cookies = await web.configuration.websiteDataStore.httpCookieStore.allCookies()
            var request = URLRequest(url: url); request.allHTTPHeaderFields = HTTPCookie.requestHeaderFields(with: cookies)
            let (temp, response) = try await URLSession.shared.download(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
            let dest = URL.documentsDirectory.appending(path: "Music Video.mp4")
            let data = try Data(contentsOf: temp); try data.write(to: dest, options: .atomic)
            output = dest
            if !busy { watch() }
        } catch { message = "Video is saved on your Mac, but downloading failed: \(error.localizedDescription)" }
    }
    func importMac() async {
        importing = true; defer { importing = false }
        do {
            guard let base = URL(string: address) else { return }
            var request = URLRequest(url: base.appending(path: "api/simulator/files")); request.httpMethod = "POST"; request.timeoutInterval = 190; request.setValue("1", forHTTPHeaderField: "X-Kriya-Simulator")
            let (data, _) = try await URLSession.shared.data(for: request)
            let ticket = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            if ticket?["cancelled"] as? Bool == true { return }
            guard let id = ticket?["id"] as? String else { message = ticket?["error"] as? String ?? "Mac picker unavailable."; return }
            request.url = URL(string: "/api/simulator/files?id=\(id)", relativeTo: base); request.httpMethod = "GET"
            let (picture, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
            add(picture, name: ticket?["name"] as? String ?? "Picture")
        } catch { message = "Could not import from your Mac: \(error.localizedDescription)" }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { ready = false; message = "Mac studio is unavailable. Open Advanced and reconnect, or run this project from Xcode." }
}

struct Stage: UIViewRepresentable {
    let studio: Studio
    func makeCoordinator() -> DropCoordinator { DropCoordinator(studio: studio) }
    func makeUIView(context: Context) -> UIView {
        let container = UIView()
        let web = studio.web
        web.isUserInteractionEnabled = false
        web.frame = container.bounds; web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.addSubview(web)
        container.addInteraction(UIDropInteraction(delegate: context.coordinator))
        return container
    }
    func updateUIView(_ view: UIView, context: Context) {}
    @MainActor final class DropCoordinator: NSObject, UIDropInteractionDelegate {
        let studio: Studio
        init(studio: Studio) { self.studio = studio }
        func dropInteraction(_ interaction: UIDropInteraction, canHandle session: UIDropSession) -> Bool {
            session.canLoadObjects(ofClass: NSString.self)
        }
        func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnter session: UIDropSession) { studio.dropTargeted = true }
        func dropInteraction(_ interaction: UIDropInteraction, sessionDidExit session: UIDropSession) { studio.dropTargeted = false }
        func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnd session: UIDropSession) { studio.dropTargeted = false }
        func dropInteraction(_ interaction: UIDropInteraction, sessionDidUpdate session: UIDropSession) -> UIDropProposal {
            UIDropProposal(operation: studio.phase == "playing" && studio.cueState != "pending" ? .copy : .forbidden)
        }
        func dropInteraction(_ interaction: UIDropInteraction, performDrop session: UIDropSession) {
            studio.dropTargeted = false
            session.loadObjects(ofClass: NSString.self) { [weak self] objects in
                guard let text = objects.first as? String else { return }
                Task { @MainActor in self?.studio.steer(text: text) }
            }
        }
    }
}
