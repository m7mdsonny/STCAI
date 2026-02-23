// RiskIntel Mobile - Industrial AI Risk Intelligence
// OTP login, multi-site, events, arm/disarm, remote siren.
// See docs/mobile/01-mobile-app-spec.md

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api/client.dart';
import 'auth/auth_service.dart';
import 'screens/events_screen.dart';
import 'screens/login_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/sites_screen.dart';

const String _kPrefApiBaseUrl = 'riskintel_api_base_url';
const String kApiBaseUrl = 'http://localhost:8080';

void main() {
  runApp(const RiskIntelApp());
}

class RiskIntelApp extends StatefulWidget {
  const RiskIntelApp({super.key});

  @override
  State<RiskIntelApp> createState() => _RiskIntelAppState();
}

class _RiskIntelAppState extends State<RiskIntelApp> {
  RiskIntelApiClient? _api;
  AuthService? _auth;
  String _baseUrl = kApiBaseUrl;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _loadPrefs();
  }

  Future<void> _loadPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    final url = prefs.getString(_kPrefApiBaseUrl)?.trim() ?? kApiBaseUrl;
    if (mounted) {
      setState(() {
        _baseUrl = url;
        _api = RiskIntelApiClient(baseUrl: url);
        _auth = AuthService(api: _api!);
        _ready = true;
      });
    }
  }

  Future<void> _saveBaseUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kPrefApiBaseUrl, url.trim());
    _api?.setBaseUrl(url.trim());
    if (mounted) setState(() => _baseUrl = url.trim());
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready || _api == null || _auth == null) {
      return MaterialApp(
        title: 'RiskIntel',
        home: Scaffold(body: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [const CircularProgressIndicator(), const SizedBox(height: 16), Text('Loading...', style: TextStyle(color: Colors.grey.shade600))])),
      );
    }
    return MaterialApp(
      title: 'RiskIntel',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.orange),
        useMaterial3: true,
      ),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en'), Locale('ar')],
      home: AppRoot(api: _api!, auth: _auth!, baseUrl: _baseUrl, onSaveBaseUrl: _saveBaseUrl),
    );
  }
}

class AppRoot extends StatefulWidget {
  const AppRoot({super.key, required this.api, required this.auth, required this.baseUrl, required this.onSaveBaseUrl});

  final RiskIntelApiClient api;
  final AuthService auth;
  final String baseUrl;
  final Future<void> Function(String url) onSaveBaseUrl;

  @override
  State<AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<AppRoot> {
  bool _loggedIn = false;
  bool _checking = true;

  @override
  void initState() {
    super.initState();
    widget.api.setOnUnauthorized(() {
      widget.auth.logout().then((_) {
        if (mounted) setState(() { _loggedIn = false; });
      });
    });
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    await widget.auth.restoreSession();
    final ok = await widget.auth.isLoggedIn();
    if (mounted) setState(() { _loggedIn = ok; _checking = false; });
  }

  void _onLoginSuccess() => setState(() => _loggedIn = true);
  Future<void> _logout() async {
    await widget.auth.logout();
    if (mounted) setState(() => _loggedIn = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (!_loggedIn) {
      return Scaffold(
        appBar: AppBar(title: const Text('RiskIntel')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.shield_outlined, size: 80),
              const SizedBox(height: 24),
              const Text('Industrial AI Risk Intelligence', textAlign: TextAlign.center, style: TextStyle(fontSize: 18)),
              const SizedBox(height: 32),
              FilledButton.icon(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (ctx) => LoginScreen(
                      onSendOtp: widget.auth.sendOtp,
                      onVerifyOtp: (phone, code) async {
                        await widget.auth.verifyOtp(phone, code);
                      },
                      onSuccess: _onLoginSuccess,
                    ),
                  ),
                ).then((_) => _restoreSession()),
                icon: const Icon(Icons.login),
                label: const Text('Login with phone'),
              ),
            ],
          ),
        ),
      );
    }
    return MainTabs(api: widget.api, onLogout: _logout, baseUrl: widget.baseUrl, onSaveBaseUrl: widget.onSaveBaseUrl);
  }
}

class MainTabs extends StatefulWidget {
  const MainTabs({super.key, required this.api, required this.onLogout, required this.baseUrl, required this.onSaveBaseUrl});

  final RiskIntelApiClient api;
  final VoidCallback onLogout;
  final String baseUrl;
  final Future<void> Function(String url) onSaveBaseUrl;

  @override
  State<MainTabs> createState() => _MainTabsState();
}

class _MainTabsState extends State<MainTabs> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<dynamic> _sites = [];
  List<dynamic> _events = [];
  bool _loading = false;
  String? _snackMessage;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadSites();
    _loadEvents();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadSites() async {
    setState(() => _loading = true);
    try {
      final list = await widget.api.getSites();
      if (mounted) setState(() { _sites = list; _loading = false; _snackMessage = null; });
    } catch (e) {
      if (mounted) setState(() {
        _loading = false;
        _snackMessage = e is Exception ? e.toString().replaceFirst(RegExp(r'^DioException[^:]*:?\s*'), '').trim() : e.toString();
      });
    }
  }

  Future<void> _loadEvents() async {
    try {
      final list = await widget.api.getEvents();
      if (mounted) setState(() { _events = list; _snackMessage = null; });
    } catch (e) {
      if (mounted) setState(() {
        _snackMessage = e is Exception ? e.toString().replaceFirst(RegExp(r'^DioException[^:]*:?\s*'), '').trim() : e.toString();
      });
    }
  }

  void _maybeShowSnack() {
    if (_snackMessage == null) return;
    final msg = _snackMessage!;
    _snackMessage = null;
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: Colors.red.shade700),
    );
  }

  @override
  Widget build(BuildContext context) {
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeShowSnack());
    return Scaffold(
      appBar: AppBar(
        title: const Text('RiskIntel'),
        bottom: TabBar(controller: _tabController, tabs: const [Tab(text: 'Sites', icon: Icon(Icons.business)), Tab(text: 'Events', icon: Icon(Icons.notifications))]),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (ctx) => SettingsScreen(api: widget.api, currentBaseUrl: widget.baseUrl, onSaveBaseUrl: widget.onSaveBaseUrl, onLogout: widget.onLogout))),
            tooltip: 'Settings',
          ),
          IconButton(icon: const Icon(Icons.logout), onPressed: widget.onLogout, tooltip: 'Logout'),
        ],
      ),
      body: Column(
        children: [
          FutureBuilder<Map<String, dynamic>>(
            future: widget.api.getLicenseStatus().catchError((_) => <String, dynamic>{}),
            builder: (context, snap) {
              if (!snap.hasData || snap.data!.isEmpty) return const SizedBox.shrink();
              final lic = snap.data!;
              final tier = lic['tier'] as String? ?? '';
              final state = lic['state'] as String? ?? '';
              final expires = lic['expires_at'] as String?;
              return Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                color: Colors.orange.shade50,
                child: Row(
                  children: [
                    Icon(Icons.verified_user, size: 18, color: Colors.orange.shade800),
                    const SizedBox(width: 8),
                    Text('$tier • $state${expires != null ? ' • Exp: $expires' : ''}', style: TextStyle(fontSize: 12, color: Colors.orange.shade900)),
                  ],
                ),
              );
            },
          ),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                SitesScreen(
                  sites: _sites,
                  onArm: (id) async { await widget.api.armSite(id); _loadSites(); },
                  onDisarm: (id) async { await widget.api.disarmSite(id); _loadSites(); },
                  onSiren: (id) async { await widget.api.triggerSiren(id); },
                  onTapEvent: () => _tabController.animateTo(1),
                  onRefresh: _loadSites,
                ),
                EventsScreen(
                  events: _events,
                  onAck: (id) async { await widget.api.acknowledgeEvent(id); _loadEvents(); },
                  onEscalate: (id) async { await widget.api.escalateEvent(id); _loadEvents(); },
                  onRefresh: _loadEvents,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
