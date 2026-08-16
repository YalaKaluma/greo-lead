import Capacitor
import Foundation
import Security

@objc(SessionCredentialsPlugin)
public class SessionCredentialsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SessionCredentialsPlugin"
    public let jsName = "SessionCredentials"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    private let account = "alfred_session_token"

    private var service: String {
        Bundle.main.bundleIdentifier ?? "ai.alfredos.alfred"
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty else {
            resolveDelete(call)
            return
        }
        guard let data = token.data(using: .utf8) else {
            call.reject("Could not encode the session credential")
            return
        }

        let query = keychainQuery()
        SecItemDelete(query as CFDictionary)

        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else {
            call.reject("Could not securely store the session credential", nil, keychainError(status))
            return
        }
        call.resolve()
    }

    @objc func get(_ call: CAPPluginCall) {
        var query = keychainQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            call.resolve(["token": NSNull()])
            return
        }
        guard status == errSecSuccess,
              let data = result as? Data,
              let token = String(data: data, encoding: .utf8) else {
            call.reject("Could not restore the secure session credential", nil, keychainError(status))
            return
        }
        call.resolve(["token": token])
    }

    @objc func clear(_ call: CAPPluginCall) {
        resolveDelete(call)
    }

    private func resolveDelete(_ call: CAPPluginCall) {
        let status = SecItemDelete(keychainQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Could not clear the secure session credential", nil, keychainError(status))
            return
        }
        call.resolve()
    }

    private func keychainQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: false
        ]
    }

    private func keychainError(_ status: OSStatus) -> Error {
        let message = SecCopyErrorMessageString(status, nil) as String? ?? "Keychain error \(status)"
        return NSError(domain: NSOSStatusErrorDomain, code: Int(status), userInfo: [
            NSLocalizedDescriptionKey: message
        ])
    }
}
