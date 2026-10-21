package id.asuransi.inteligenos

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Navy = Color(0xFF102A43)
private val Teal = Color(0xFF147D78)
private val Canvas = Color(0xFFF4F7FB)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme(colorScheme = lightColorScheme(primary = Teal, background = Canvas)) { InsuranceApp() } }
    }
}

@Composable
private fun InsuranceApp() {
    var selected by remember { mutableStateOf("Ikhtisar") }
    var assistantOpen by remember { mutableStateOf(false) }
    var prompt by remember { mutableStateOf("") }
    var reply by remember { mutableStateOf("Saya AI Companion dalam mode awal. Mesin AI lokal dan paket regulasi terverifikasi belum dipasang. Jangan masukkan data nasabah rahasia ke prototipe ini.") }
    val nav = listOf("Ikhtisar", "CRM & Nasabah", "Polis", "Klaim", "Accounting", "HRD & Payroll", "Basis Pengetahuan", "AI Companion", "Keamanan")
    Scaffold(
        topBar = {
            TopAppBarCompat(title = "ASURANSI INTELIGEN OS", subtitle = "Klien Android · Fondasi offline-first",
                onAssistant = { assistantOpen = !assistantOpen })
        },
        containerColor = Canvas
    ) { padding ->
        Row(Modifier.fillMaxSize().padding(padding)) {
            NavigationRailCompat(selected, nav) { selected = it }
            LazyColumn(Modifier.weight(1f).fillMaxHeight().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item {
                    Text(selected, fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Navy)
                    Spacer(Modifier.height(6.dp))
                    Text("Workspace operasional asuransi", color = Color(0xFF6C8195), fontSize = 13.sp)
                    Spacer(Modifier.height(14.dp))
                    Surface(color = Color(0xFFFFF5E4), shape = RoundedCornerShape(10.dp)) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.CloudOff, contentDescription = null, tint = Color(0xFF9B6A22))
                            Spacer(Modifier.width(8.dp))
                            Text("Mode lokal awal · Belum terhubung ke server", color = Color(0xFF8A642D), fontSize = 12.sp)
                        }
                    }
                }
                if (selected == "Ikhtisar") {
                    item { MetricCard("Polis dan klaim", "Workspace terintegrasi", "Navigasi modul tersedia; data operasional belum disinkronkan.") }
                    item { MetricCard("Keamanan", "Akses dibatasi", "API produksi, autentikasi, dan izin server wajib dikonfigurasi sebelum penggunaan nyata.") }
                    item { MetricCard("AI Companion", "Bantuan terkontrol", "AI harus menunjukkan sumber, tanggal berlaku, dan eskalasi ke manusia.") }
                } else if (selected == "AI Companion" || assistantOpen) {
                    item {
                        Text("AI Companion", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Navy)
                        Text(reply, modifier = Modifier.padding(vertical = 10.dp), fontSize = 13.sp, color = Color(0xFF40566D))
                        OutlinedTextField(value = prompt, onValueChange = { prompt = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Tulis tugas") })
                        Button(onClick = { if (prompt.isNotBlank()) { reply = "Permintaan diterima: “$prompt”. Ini masih prototipe UI; belum ada inferensi model AI atau pencarian regulasi aktif."; prompt = "" } }, modifier = Modifier.padding(top = 8.dp)) { Text("Kirim") }
                    }
                } else {
                    item { MetricCard(selected, "Modul disiapkan", "Form CRUD, validasi, audit, dan koneksi API akan diaktifkan setelah layanan server terkonfigurasi.") }
                }
                item { Spacer(Modifier.height(10.dp)); Text("Pintasan modul", fontWeight = FontWeight.Bold, color = Navy, fontSize = 16.sp) }
                items(nav.drop(1).take(6)) { item ->
                    Surface(onClick = { selected = item }, color = Color.White, shape = RoundedCornerShape(10.dp), shadowElevation = 1.dp) {
                        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Teal)
                            Spacer(Modifier.width(8.dp))
                            Text(item, fontSize = 13.sp, color = Navy, modifier = Modifier.weight(1f))
                            Icon(Icons.Default.ArrowForward, contentDescription = null, tint = Color(0xFF94A6B7))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TopAppBarCompat(title: String, subtitle: String, onAssistant: () -> Unit) {
    Surface(color = Navy) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Text(subtitle, color = Color(0xFFB8CBD9), fontSize = 10.sp)
            }
            IconButton(onClick = onAssistant) { Icon(Icons.Default.SmartToy, contentDescription = "AI Companion", tint = Color(0xFF8BE6D1)) }
        }
    }
}

@Composable
private fun NavigationRailCompat(selected: String, nav: List<String>, onSelect: (String) -> Unit) {
    Column(Modifier.width(82.dp).fillMaxHeight().background(Color.White).padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        nav.forEachIndexed { index, item ->
            val chosen = selected == item
            TextButton(onClick = { onSelect(item) }, modifier = Modifier.fillMaxWidth().padding(horizontal = 3.dp)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(when(index) {
                        0 -> Icons.Default.Dashboard
                        1 -> Icons.Default.People
                        2 -> Icons.Default.Description
                        3 -> Icons.Default.Assignment
                        4 -> Icons.Default.AccountBalance
                        5 -> Icons.Default.Badge
                        6 -> Icons.Default.MenuBook
                        7 -> Icons.Default.SmartToy
                        else -> Icons.Default.Security
                    }, contentDescription = null, tint = if (chosen) Teal else Color(0xFF8194A7), modifier = Modifier.size(19.dp))
                    Spacer(Modifier.height(3.dp))
                    Text(item.take(9), fontSize = 8.sp, color = if (chosen) Teal else Color(0xFF71859A), maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun MetricCard(title: String, value: String, description: String) {
    Surface(color = Color.White, shape = RoundedCornerShape(12.dp), shadowElevation = 1.dp) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Text(title, fontSize = 12.sp, color = Color(0xFF6C8195))
            Spacer(Modifier.height(7.dp))
            Text(value, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Navy)
            Spacer(Modifier.height(6.dp))
            Text(description, fontSize = 12.sp, color = Color(0xFF70859A), lineHeight = 18.sp)
        }
    }
}
