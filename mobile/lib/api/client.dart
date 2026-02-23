// RiskIntel API client - base URL, JWT, interceptors.
// See docs/api/openapi-cloud.yaml

import 'package:dio/dio.dart';

class RiskIntelApiClient {
  RiskIntelApiClient({required this.baseUrl, String? accessToken, void Function()? onUnauthorized}) : _dio = Dio(BaseOptions(baseUrl: baseUrl)), _onUnauthorized = onUnauthorized {
    if (accessToken != null) _dio.options.headers['Authorization'] = 'Bearer $accessToken';
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) => handler.next(options),
      onError: (err, handler) {
        if (err.response?.statusCode == 401) _onUnauthorized?.call();
        return handler.next(err);
      },
    ));
  }

  final String baseUrl;
  final Dio _dio;
  void Function()? _onUnauthorized;
  Dio get dio => _dio;

  void setAccessToken(String token) {
    _dio.options.headers['Authorization'] = 'Bearer $token';
  }

  void setOnUnauthorized(void Function()? callback) {
    _onUnauthorized = callback;
  }

  void setBaseUrl(String url) {
    _dio.options.baseUrl = url.trim().replaceFirst(RegExp(r'/+$'), '');
  }

  // Auth
  Future<void> sendOtp(String phone) async {
    await _dio.post('/v1/auth/otp/send', data: {'phone': phone});
  }

  Future<Map<String, dynamic>> verifyOtp(String phone, String code) async {
    final r = await _dio.post('/v1/auth/otp/verify', data: {'phone': phone, 'code': code});
    return r.data as Map<String, dynamic>;
  }

  // Sites
  Future<List<dynamic>> getSites() async {
    final r = await _dio.get('/v1/sites');
    final data = r.data as Map<String, dynamic>?;
    final items = data?['items'];
    return items is List ? items : <dynamic>[];
  }

  Future<void> armSite(String siteId) async {
    await _dio.post('/v1/sites/$siteId/arm');
  }

  Future<void> disarmSite(String siteId) async {
    await _dio.post('/v1/sites/$siteId/disarm');
  }

  Future<void> triggerSiren(String siteId, {int durationSec = 30}) async {
    await _dio.post('/v1/sites/$siteId/siren', data: {'duration_sec': durationSec});
  }

  // Events
  Future<List<dynamic>> getEvents({String? siteId, String? type, int page = 1, int pageSize = 20}) async {
    final r = await _dio.get('/v1/events', queryParameters: {
      if (siteId != null) 'site_id': siteId,
      if (type != null) 'type': type,
      'page': page,
      'page_size': pageSize,
    });
    final data = r.data as Map<String, dynamic>?;
    final items = data?['items'];
    return items is List ? items : <dynamic>[];
  }

  Future<void> acknowledgeEvent(String eventId) async {
    await _dio.post('/v1/events/$eventId/acknowledge');
  }

  Future<void> escalateEvent(String eventId, {String? note}) async {
    await _dio.post('/v1/events/$eventId/escalate', data: note != null ? {'note': note} : null);
  }

  // License
  Future<Map<String, dynamic>> getLicenseStatus() async {
    final r = await _dio.get('/v1/license/status');
    return (r.data is Map<String, dynamic>) ? r.data as Map<String, dynamic> : <String, dynamic>{};
  }
}
