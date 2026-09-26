import XCTest
final class StudioTests: XCTestCase {

    func testPromptClipboardRoundTrip() {
        let app = XCUIApplication(); app.launch()
        let input = app.descendants(matching: .any)["openingIdea"].firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 30))
        let original = input.value as? String
        XCTAssertNotNil(original)
        app.buttons["copyPrompt"].tap()
        input.tap(); input.typeText(" changed")
        if app.buttons["Done"].exists { app.buttons["Done"].tap() }
        let paste = app.buttons["pastePrompt"]
        XCTAssertTrue(paste.waitForExistence(timeout: 5))
        paste.tap()
        XCTAssertEqual(input.value as? String, original)
    }
    func testPreloadedPicturesAndNativeFiles() {
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.buttons["Tiger"].waitForExistence(timeout: 30))
        app.buttons["Tiger"].tap()
        XCTAssertTrue(app.staticTexts["Start your video first, then tap or drag a picture."].waitForExistence(timeout: 10))
        app.buttons["Files"].tap()
        XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout: 10))
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.buttons["Start video"].exists)
    }
    func testImportPicturePersists() {
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.buttons["Files"].waitForExistence(timeout: 30)); app.buttons["Files"].tap()
        let tiger = app.cells.containing(NSPredicate(format: "label BEGINSWITH 'tiger' AND label CONTAINS 'jpg'")).firstMatch
        if !tiger.waitForExistence(timeout: 3) {
            let own = app.cells.containing(NSPredicate(format: "label BEGINSWITH 'Music Video,'")).firstMatch
            let kriya = app.cells.containing(NSPredicate(format: "label BEGINSWITH 'Kriya,'")).firstMatch
            if own.exists { own.tap() } else if kriya.exists { kriya.tap() }
            let pictures = app.cells.containing(NSPredicate(format: "label BEGINSWITH 'Pictures'")).firstMatch
            let demo = app.cells.containing(NSPredicate(format: "label BEGINSWITH 'Demo pictures'")).firstMatch
            if pictures.exists { pictures.tap() } else if demo.exists { demo.tap() }
        }
        XCTAssertTrue(tiger.waitForExistence(timeout: 10)); tiger.tap()
        let open = app.buttons["Open"]; if open.waitForExistence(timeout: 3) { open.tap() }
        XCTAssertTrue(app.buttons["tiger"].waitForExistence(timeout: 15))
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["tiger"].waitForExistence(timeout: 20))
    }
    func testLiveProduction() throws {
        guard ProcessInfo.processInfo.environment["KRIYA_LIVE_TEST"] == "1" else { throw XCTSkip("Opt-in paid generation test; use MusicVideoLive scheme.") }
        let app = XCUIApplication(); app.launch()
        let start = app.buttons["Start video"]
        XCTAssertTrue(start.waitForExistence(timeout: 40))
        let enabled = NSPredicate(format: "enabled == true")
        expectation(for: enabled, evaluatedWith: start)
        waitForExpectations(timeout: 40)
        start.tap()
        let status = app.staticTexts["studioStatus"]
        let playing = NSPredicate(format: "label CONTAINS 'Orbis is live'")
        expectation(for: playing, evaluatedWith: status)
        waitForExpectations(timeout: 300)
        app.buttons["Tiger"].press(forDuration: 1, thenDragTo: app.webViews.firstMatch)
        XCTAssertTrue(app.otherElements["cueFeedback"].exists || app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'received' OR label CONTAINS 'accepted'")).firstMatch.waitForExistence(timeout: 10))
        let added = NSPredicate(format: "label CONTAINS 'added to your video'")
        expectation(for: added, evaluatedWith: status)
        waitForExpectations(timeout: 90)
        XCTAssertTrue(app.staticTexts["liveVocalLyrics"].waitForExistence(timeout: 35))
        let watch = app.buttons["Watch your video"]
        XCTAssertTrue(watch.waitForExistence(timeout: 600), app.debugDescription)
        let ready = NSPredicate(format: "enabled == true")
        expectation(for: ready, evaluatedWith: watch)
        waitForExpectations(timeout: 600)
        watch.tap()
    }

    func testExampleAndAdvanced() {
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.buttons["Watch an example"].waitForExistence(timeout: 30))
        app.buttons["Watch an example"].tap()
        XCTAssertTrue(app.buttons["Advanced"].exists)
        app.buttons["Advanced"].tap()
        XCTAssertTrue(app.buttons["Reconnect"].waitForExistence(timeout: 10))
        app.buttons["Done"].tap()
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(app.buttons["Files"].waitForExistence(timeout: 10))
        XCUIDevice.shared.orientation = .portrait
    }
}
