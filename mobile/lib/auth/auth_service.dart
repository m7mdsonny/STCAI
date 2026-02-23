// RiskIntel - Auth: OTP send/verify, token storage.
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../api/client.dart';

class AuthService {
  AuthService({required this.api, FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final RiskIntelApiClient api;
  final FlutterSecureStorage _storage;

  static const _keyAccessToken = 'riskintel_access_token';
  static const _keyRefreshToken = 'riskintel_refresh_token';
  static const _keyPhone = 'riskintel_phone';

  Future<void> sendOtp(String phone) async {
    await api.sendOtp(phone);
  }

  Future<AuthResult> verifyOtp(String phone, String code) async {
    final data = await api.verifyOtp(phone, code);
    final accessToken = data['access_token'] as String?;
    final refreshToken = data['refresh_token'] as String?;
    final user = data['user'] as Map<String, dynamic>?;
    if (accessToken == null) throw Exception('No token in response');
    await _storage.write(key: _keyAccessToken, value: accessToken);
    if (refreshToken != null) await _storage.write(key: _keyRefreshToken, value: refreshToken);
    await _storage.write(key: _keyPhone, value: phone);
    api.setAccessToken(accessToken);
    return AuthResult(accessToken: accessToken, user: user);
  }

  Future<String?> getStoredAccessToken() async {
    return _storage.read(key: _keyAccessToken);
  }

  Future<void> restoreSession() async {
    final token = await getStoredAccessToken();
    if (token != null) api.setAccessToken(token);
  }

  Future<bool> isLoggedIn() async {
    final token = await getStoredAccessToken();
    return token != null && token.isNotEmpty;
  }

  Future<void> logout() async {
    await _storage.delete(key: _keyAccessToken);
    await _storage.delete(key: _keyRefreshToken);
    await _storage.delete(key: _keyPhone);
  }
}

class AuthResult {
  AuthResult({required this.accessToken, this.user});
  final String accessToken;
  final Map<String, dynamic>? user;
}
