import SwiftUI
import PhotosUI
import AVKit
import UniformTypeIdentifiers

@main struct MusicVideoApp: App {
    var body: some Scene { WindowGroup { StudioView() } }
}

struct StudioView: View {
    @StateObject private var studio = Studio()
    @State private var photos: [PhotosPickerItem] = []
    @State private var files = false
    @State private var advanced = false
    @State private var direction = ""
    @State private var edit = ""
    @FocusState private var ideaFocused: Bool
    private let accent = Color(red: 0.77, green: 0.94, blue: 0.39)
    var body: some View {
        NavigationStack {
            Group {
                if #available(iOS 27.1, *) {
                    ArrangementView { movie } secondary: { controls }.arrangementViewStyle(.split)
                } else {
                    ViewThatFits(in: .horizontal) {
                        HStack { movie.frame(minWidth: 380); controls.frame(width: 340) }
                        ScrollView { VStack { movie; controls } }
                    }
                }
            }
            .background(Color(red: 0.055, green: 0.065, blue: 0.06))
            .navigationTitle("DropBeat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { ideaFocused = false } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { advanced = true } label: { Label("Advanced", systemImage: "slider.horizontal.3") }
                }
            }
            .sheet(isPresented: $advanced) {
                NavigationStack {
                    Form {
                        Section("Mac connection") {
                            TextField("Studio address", text: $studio.address).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                            Button("Reconnect") { studio.connect(); advanced = false }.disabled(studio.running || studio.busy)
                            Text("Xcode starts your Mac studio automatically. Your existing AI keys and Blender stay on the Mac.")
                        }
                    }.navigationTitle("Advanced").toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { advanced = false } } }
                }
            }
            .fileImporter(isPresented: $files, allowedContentTypes: [.image], allowsMultipleSelection: true) { result in
                switch result { case .success(let urls): studio.importFiles(urls); case .failure(let error): studio.message = error.localizedDescription }
            }
            .onChange(of: photos) { _, items in
                Task {
                    for item in items {
                        do { if let data = try await item.loadTransferable(type: Data.self) { studio.add(data, name: "My picture") } }
                        catch { studio.message = "Could not load this photo. Try Files instead." }
                    }
                    photos = []
                }
            }
        }.preferredColorScheme(.dark).tint(accent)
    }
    private var movie: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ZStack {
                    Stage(studio: studio)
                    if !studio.ready { Image("ocean").resizable().scaledToFill().clipped().allowsHitTesting(false) }
                    if let player = studio.player { VideoPlayer(player: player) }
                }
                .aspectRatio(16/9, contentMode: .fit)
                .frame(maxHeight: 290)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .overlay {
                    if studio.dropTargeted {
                        RoundedRectangle(cornerRadius: 18).stroke(accent, lineWidth: 4)
                            .overlay { Text(studio.phase == "playing" ? "Drop here to change the scene" : "Start your video first").font(.headline).padding().background(.ultraThinMaterial, in: Capsule()) }
                            .allowsHitTesting(false)
                    }
                }
                .overlay(alignment: .bottom) {
                    if studio.phase == "playing" && !studio.vocalLyrics.isEmpty {
                        Text(studio.vocalLyrics).accessibilityIdentifier("liveVocalLyrics").font(.callout.bold()).multilineTextAlignment(.center)
                            .padding(8).background(.black.opacity(0.8), in: RoundedRectangle(cornerRadius: 8)).padding(8).allowsHitTesting(false)
                    }
                }
                .overlay(alignment: .topLeading) {
                    if !studio.cueMessage.isEmpty && !studio.dropTargeted {
                        HStack(spacing: 8) {
                            if studio.cueState == "pending" { ProgressView() }
                            else { Image(systemName: studio.cueState == "accepted" ? "checkmark.circle.fill" : "exclamationmark.circle.fill").foregroundStyle(studio.cueState == "accepted" ? accent : .orange) }
                            Text(studio.cueMessage).font(.callout.weight(.medium))
                        }.padding(12).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12)).padding(10)
                            .accessibilityIdentifier("cueFeedback").allowsHitTesting(false)
                    }
                }
                HStack {
                    Text(studio.running ? String(format: "0:%02d / 1:00", min(60, Int(studio.seconds))) : "One minute. Your direction.").font(.subheadline.monospacedDigit())
                    Spacer()
                    if studio.busy || studio.phase == "connecting" { ProgressView() }
                }.foregroundStyle(.secondary)
                if let output = studio.output {
                    HStack {
                        Button("Watch your video", systemImage: "play.rectangle") { studio.watch() }
                        ShareLink(item: output) { Label("Export video", systemImage: "square.and.arrow.up") }
                    }.disabled(studio.running || studio.busy)
                    HStack {
                        TextField("Want a change? Warmer colours…", text: $edit)
                        Button { studio.refine(edit); edit = "" } label: { Image(systemName: "arrow.up.circle.fill") }.accessibilityLabel("Refine video").disabled(edit.isEmpty || studio.busy || studio.running)
                    }.textFieldStyle(.roundedBorder)
                }
                Button("Watch an example", systemImage: "play.circle") { studio.demo() }.disabled(studio.running || studio.busy)
            }.padding(20)
        }
    }
    private var controls: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Start with an idea").font(.title2.bold())
                    TextField("Describe the opening scene", text: $studio.idea, axis: .vertical).focused($ideaFocused).accessibilityIdentifier("openingIdea").lineLimit(2...4).textFieldStyle(.roundedBorder).disabled(studio.running || studio.busy)
                    Picker("Sound", selection: $studio.style) {
                        ForEach(["High-energy rap", "Trap", "Electronic", "Cinematic"], id: \.self) { Text($0) }
                    }.pickerStyle(.menu).disabled(studio.running || studio.busy)
                }
                Text(studio.message).font(.callout).foregroundStyle(.secondary).accessibilityIdentifier("studioStatus")
                if studio.canRetry {
                    Button("Retry song", systemImage: "arrow.clockwise") { studio.retrySong() }.buttonStyle(.borderedProminent).foregroundStyle(.black).disabled(studio.busy)
                }
                if studio.needsDownload {
                    Button("Download video", systemImage: "arrow.down.circle") { studio.retryDownload() }.buttonStyle(.borderedProminent).foregroundStyle(.black)
                }
                if studio.running {
                    Button("Finish video", systemImage: "stop.fill") { studio.stop() }.buttonStyle(.borderedProminent).controlSize(.large).foregroundStyle(.black).disabled(studio.busy)
                } else {
                    Button("Start video", systemImage: "play.fill") { studio.start() }
                        .buttonStyle(.borderedProminent).controlSize(.large).foregroundStyle(.black)
                        .disabled(!studio.ready || studio.busy || studio.idea.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                VStack(alignment: .leading, spacing: 10) {
                    Text("Your pictures").font(.headline)
                    Text("Load first. Tap or drag into the video while it plays.").font(.callout).foregroundStyle(.secondary)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 12) {
                        ForEach(studio.pictures) { picture in
                            Button { studio.steer(picture) } label: {
                                VStack(alignment: .leading, spacing: 5) {
                                    if let image = studio.image(picture) {
                                        Image(uiImage: image).resizable().scaledToFill().frame(height: 82, alignment: .top).clipped().clipShape(RoundedRectangle(cornerRadius: 10))
                                    }
                                    Text(picture.name).font(.caption).lineLimit(1)
                                }
                            }.buttonStyle(.plain).draggable(picture.id).accessibilityLabel(picture.name)
                            .overlay(alignment: .topTrailing) {
                                if studio.activePicture == picture.id {
                                    Image(systemName: studio.cueState == "accepted" ? "checkmark.circle.fill" : studio.cueState == "failed" ? "exclamationmark.circle.fill" : "clock.fill")
                                        .padding(5).background(.regularMaterial, in: Circle()).foregroundStyle(accent).allowsHitTesting(false)
                                }
                            }
                        }
                    }
                    HStack {
                        PhotosPicker(selection: $photos, maxSelectionCount: 12, matching: .images) { Label("Photos", systemImage: "photo") }
                        Button { files = true } label: { Label("Files", systemImage: "folder") }
                        #if targetEnvironment(simulator)
                        Button("From Mac") { Task { await studio.importMac() } }.disabled(studio.importing)
                        #endif
                    }.font(.callout).buttonStyle(.bordered)
                }
                HStack {
                    TextField("Or type a change…", text: $direction).textFieldStyle(.roundedBorder).onSubmit { sendDirection() }
                    Button(action: sendDirection) { Image(systemName: "arrow.up.circle.fill").font(.title2) }.accessibilityLabel("Send direction").disabled(studio.phase != "playing" || direction.isEmpty)
                }
            }.padding(20)
        }
    }
    private func sendDirection() { studio.steer(text: direction); if studio.phase == "playing" { direction = "" } }
}
