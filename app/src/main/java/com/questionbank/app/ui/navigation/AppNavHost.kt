package com.questionbank.app.ui.navigation

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.navigation
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.questionbank.app.QuestionBankApp
import com.questionbank.app.ui.backup.BackupScreen
import com.questionbank.app.ui.backup.BackupViewModel
import com.questionbank.app.ui.backup.backupStatusLine
import com.questionbank.app.ui.components.PlaceholderScreen
import com.questionbank.app.ui.hierarchy.HierarchyLabels
import com.questionbank.app.ui.hierarchy.HierarchyListScreen
import com.questionbank.app.ui.hierarchy.HierarchyListViewModel
import com.questionbank.app.ui.profile.ProfileScreen
import com.questionbank.app.domain.question.QuestionGroupKey
import com.questionbank.app.ui.question.QuestionEditScreen
import com.questionbank.app.ui.question.QuestionEditViewModel
import com.questionbank.app.ui.question.QuestionEditorScreen
import com.questionbank.app.ui.question.QuestionEditorViewModel
import com.questionbank.app.ui.question.QuestionListScreen
import com.questionbank.app.ui.question.QuestionListViewModel
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map

/** Route names. Add one constant per destination; keep them stable (they appear in saved state). */
object Routes {
    // The five tabs. Each tab is its own navigation graph, so every tab keeps its own position when the owner switches tabs.
    const val TAB_CREATE = "tab/create"
    const val TAB_TYPE_CQ = "tab/type_cq"
    const val TAB_CHAPTER_CQ = "tab/chapter_cq"
    const val TAB_FILTER = "tab/filter"
    const val TAB_PROFILE = "tab/profile"

    const val CREATE_HOME = "create/home"
    const val CHAPTER_CQ_HOME = "chapter_cq/home"
    const val FILTER_HOME = "filter/home"
    const val PROFILE_HOME = "profile/home"
    const val BACKUP = "profile/backup"

    const val SUBJECTS = "type_cq/subjects"
    const val CHAPTERS = "type_cq/subjects/{subjectId}/chapters"
    const val TOPICS = "type_cq/chapters/{chapterId}/topics"
    const val QUESTIONS = "type_cq/topics/{topicId}/questions"
    const val QUESTION_EDITOR = "type_cq/topics/{topicId}/questions/new"
    const val QUESTION_EDIT = "type_cq/topics/{topicId}/questions/edit/{groupKey}"
    const val SAVED_COUNT_KEY = "savedCount"
    const val EDITED_KEY = "questionEdited"

    fun chapters(subjectId: String) = "type_cq/subjects/$subjectId/chapters"
    fun topics(chapterId: String) = "type_cq/chapters/$chapterId/topics"
    fun questions(topicId: String) = "type_cq/topics/$topicId/questions"
    fun questionEditor(topicId: String) = "type_cq/topics/$topicId/questions/new"
    fun questionEdit(topicId: String, groupKey: String) = "type_cq/topics/$topicId/questions/edit/$groupKey"
}

private val SUBJECT_LABELS = HierarchyLabels(
    title = "বিষয়", addButton = "+ বিষয়", dialogTitle = "নতুন বিষয়",
    renameTitle = "বিষয়ের নাম পরিবর্তন", totalLabel = "মোট বিষয়", childUnit = "অধ্যায়",
)
private val CHAPTER_LABELS = HierarchyLabels(
    title = "অধ্যায়", addButton = "+ অধ্যায়", dialogTitle = "নতুন অধ্যায়",
    renameTitle = "অধ্যায়ের নাম পরিবর্তন", totalLabel = "মোট অধ্যায়", childUnit = "টপিক",
)
private val TOPIC_LABELS = HierarchyLabels(
    title = "টপিক", addButton = "+ টপিক", dialogTitle = "নতুন টপিক",
    renameTitle = "টপিকের নাম পরিবর্তন", totalLabel = "মোট টপিক", childUnit = null,
)

/** One bottom-bar tab. The glyph is plain text for now (no icon library is added in this package). */
private class Tab(val route: String, val label: String, val glyph: String)

/** Order from the owner's design (plan 39.3): Create | Type CQ | Chapter CQ | Filter | Profile. */
private val TABS = listOf(
    Tab(Routes.TAB_CREATE, "Create", "✚"),
    Tab(Routes.TAB_TYPE_CQ, "Type CQ", "▤"),
    Tab(Routes.TAB_CHAPTER_CQ, "Chapter CQ", "▦"),
    Tab(Routes.TAB_FILTER, "Filter", "☰"),
    Tab(Routes.TAB_PROFILE, "Profile", "☺"),
)

@Composable
fun AppNavHost() {
    val navController = rememberNavController()
    val context = LocalContext.current
    val container = (context.applicationContext as QuestionBankApp).container
    val repo = container.typeCqHierarchy
    val questionRepo = container.typeCqQuestions

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination
    val currentRoute = currentDestination?.route
    // The editor is full screen: more room for typing, and no tab switch in the middle of a question.
    val showBottomBar = currentRoute != Routes.QUESTION_EDITOR && currentRoute != Routes.QUESTION_EDIT

    // Back at the very first screen asks before leaving (design 39.3).
    var showExitDialog by rememberSaveable { mutableStateOf(false) }
    BackHandler(enabled = currentRoute == Routes.SUBJECTS) { showExitDialog = true }
    if (showExitDialog) {
        AlertDialog(
            onDismissRequest = { showExitDialog = false },
            title = { Text("অ্যাপ থেকে বের হবেন?") },
            text = { Text("আপনার সংরক্ষিত প্রশ্ন ও ড্রাফট ফোনে থাকবে।") },
            confirmButton = {
                TextButton(onClick = {
                    showExitDialog = false
                    (context as? Activity)?.finish()
                }) { Text("বের হই") }
            },
            dismissButton = { TextButton(onClick = { showExitDialog = false }) { Text("থাকি") } },
        )
    }

    Scaffold(
        // Every screen has its own header and handles the status bar itself; the bottom bar handles the navigation bar.
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        bottomBar = { if (showBottomBar) AppBottomBar(navController, currentDestination) },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Routes.TAB_TYPE_CQ,
            modifier = Modifier.padding(innerPadding).consumeWindowInsets(innerPadding),
        ) {
            navigation(startDestination = Routes.CREATE_HOME, route = Routes.TAB_CREATE) {
                composable(Routes.CREATE_HOME) {
                    PlaceholderScreen(
                        title = "তৈরি (Create)",
                        subtitle = "পরীক্ষা ও প্রশ্নপত্র ব্যবস্থাপনা",
                        message = "প্রশ্নপত্র তৈরি পরবর্তী সংস্করণে আসছে।",
                    )
                }
            }

            navigation(startDestination = Routes.SUBJECTS, route = Routes.TAB_TYPE_CQ) {
                composable(Routes.SUBJECTS) {
                    val vm: HierarchyListViewModel = viewModel(
                        factory = HierarchyListViewModel.factory {
                            HierarchyListViewModel(
                                rowsFlow = repo.observeSubjectRows(),
                                ancestorsFlow = flowOf(emptyList()),
                                addItem = { name -> repo.addSubject(name) },
                                renameItem = { id, name -> repo.renameSubject(id, name) },
                                deleteItem = { id -> repo.deleteSubject(id) },
                                reorderItems = { ids -> repo.reorderSubjects(ids) },
                            )
                        }
                    )
                    HierarchyListScreen(
                        viewModel = vm,
                        labels = SUBJECT_LABELS,
                        onItemClick = { navController.navigate(Routes.chapters(it.id)) },
                        onBack = null,
                    )
                }

                composable(
                    route = Routes.CHAPTERS,
                    arguments = listOf(navArgument("subjectId") { type = NavType.StringType }),
                ) { entry ->
                    val subjectId = entry.arguments?.getString("subjectId").orEmpty()
                    val vm: HierarchyListViewModel = viewModel(
                        factory = HierarchyListViewModel.factory {
                            HierarchyListViewModel(
                                rowsFlow = repo.observeChapterRows(subjectId),
                                ancestorsFlow = repo.observeSubject(subjectId).map { listOfNotNull(it?.name) },
                                addItem = { name -> repo.addChapter(subjectId, name) },
                                renameItem = { id, name -> repo.renameChapter(id, name) },
                                deleteItem = { id -> repo.deleteChapter(id) },
                                reorderItems = { ids -> repo.reorderChapters(subjectId, ids) },
                            )
                        }
                    )
                    HierarchyListScreen(
                        viewModel = vm,
                        labels = CHAPTER_LABELS,
                        onItemClick = { navController.navigate(Routes.topics(it.id)) },
                        onBack = { navController.popBackStack() },
                        // crumbs: 0 = subject list (current list is the chapters of the last crumb)
                        onCrumbClick = { index -> if (index == 0) navController.popBackStack(Routes.SUBJECTS, false) },
                    )
                }

                composable(
                    route = Routes.TOPICS,
                    arguments = listOf(navArgument("chapterId") { type = NavType.StringType }),
                ) { entry ->
                    val chapterId = entry.arguments?.getString("chapterId").orEmpty()
                    val vm: HierarchyListViewModel = viewModel(
                        factory = HierarchyListViewModel.factory {
                            HierarchyListViewModel(
                                rowsFlow = repo.observeTopicRows(chapterId),
                                ancestorsFlow = repo.observeChapterPath(chapterId).map { path ->
                                    if (path == null) emptyList() else listOf(path.subject.name, path.chapter.name)
                                },
                                addItem = { name -> repo.addTopic(chapterId, name) },
                                renameItem = { id, name -> repo.renameTopic(id, name) },
                                deleteItem = { id -> repo.deleteTopic(id) },
                                reorderItems = { ids -> repo.reorderTopics(chapterId, ids) },
                            )
                        }
                    )
                    HierarchyListScreen(
                        viewModel = vm,
                        labels = TOPIC_LABELS,
                        onItemClick = { navController.navigate(Routes.questions(it.id)) },
                        onBack = { navController.popBackStack() },
                        // crumbs: 0 = subject list, 1 = chapter list of that subject, 2 = this list (not tappable)
                        onCrumbClick = { index ->
                            when (index) {
                                0 -> navController.popBackStack(Routes.SUBJECTS, false)
                                1 -> navController.popBackStack(Routes.CHAPTERS, false)
                            }
                        },
                    )
                }

                composable(
                    route = Routes.QUESTIONS,
                    arguments = listOf(navArgument("topicId") { type = NavType.StringType }),
                ) { entry ->
                    val topicId = entry.arguments?.getString("topicId").orEmpty()
                    val vm: QuestionListViewModel = viewModel(
                        factory = QuestionListViewModel.factory { QuestionListViewModel(topicId, questionRepo) }
                    )
                    val savedCount by entry.savedStateHandle.getStateFlow(Routes.SAVED_COUNT_KEY, 0).collectAsState()
                    val edited by entry.savedStateHandle.getStateFlow(Routes.EDITED_KEY, false).collectAsState()
                    QuestionListScreen(
                        viewModel = vm,
                        savedCount = savedCount,
                        onSavedShown = { entry.savedStateHandle[Routes.SAVED_COUNT_KEY] = 0 },
                        edited = edited,
                        onEditedShown = { entry.savedStateHandle[Routes.EDITED_KEY] = false },
                        onAdd = { navController.navigate(Routes.questionEditor(topicId)) },
                        onEdit = { group ->
                            QuestionGroupKey.of(group)?.let { navController.navigate(Routes.questionEdit(topicId, it)) }
                        },
                        onBack = { navController.popBackStack() },
                    )
                }

                composable(
                    route = Routes.QUESTION_EDITOR,
                    arguments = listOf(navArgument("topicId") { type = NavType.StringType }),
                ) { entry ->
                    val topicId = entry.arguments?.getString("topicId").orEmpty()
                    val vm: QuestionEditorViewModel = viewModel(
                        factory = QuestionEditorViewModel.factory {
                            QuestionEditorViewModel(topicId, questionRepo, container.appScope)
                        }
                    )
                    QuestionEditorScreen(
                        viewModel = vm,
                        onSaved = { count ->
                            navController.previousBackStackEntry?.savedStateHandle?.set(Routes.SAVED_COUNT_KEY, count)
                            navController.popBackStack()
                        },
                        onBack = { navController.popBackStack() },
                    )
                }

                composable(
                    route = Routes.QUESTION_EDIT,
                    arguments = listOf(
                        navArgument("topicId") { type = NavType.StringType },
                        navArgument("groupKey") { type = NavType.StringType },
                    ),
                ) { entry ->
                    val topicId = entry.arguments?.getString("topicId").orEmpty()
                    val groupKey = entry.arguments?.getString("groupKey").orEmpty()
                    val vm: QuestionEditViewModel = viewModel(
                        factory = QuestionEditViewModel.factory { QuestionEditViewModel(topicId, groupKey, questionRepo) }
                    )
                    QuestionEditScreen(
                        viewModel = vm,
                        onSaved = {
                            navController.previousBackStackEntry?.savedStateHandle?.set(Routes.EDITED_KEY, true)
                            navController.popBackStack()
                        },
                        onBack = { navController.popBackStack() },
                    )
                }
            }

            navigation(startDestination = Routes.CHAPTER_CQ_HOME, route = Routes.TAB_CHAPTER_CQ) {
                composable(Routes.CHAPTER_CQ_HOME) {
                    PlaceholderScreen(
                        title = "Chapter CQ",
                        subtitle = "অধ্যায়ভিত্তিক সৃজনশীল প্রশ্ন",
                        message = "Chapter CQ-এর স্ক্রিন পরবর্তী ধাপে আসছে। এখন Type CQ ট্যাব ব্যবহার করুন।",
                    )
                }
            }

            navigation(startDestination = Routes.FILTER_HOME, route = Routes.TAB_FILTER) {
                composable(Routes.FILTER_HOME) {
                    PlaceholderScreen(
                        title = "ফিল্টার (Filter)",
                        subtitle = "সব প্রশ্নে খুঁজুন ও ছাঁকুন",
                        message = "খোঁজা ও ফিল্টার পরবর্তী সংস্করণে আসছে।",
                    )
                }
            }

            navigation(startDestination = Routes.PROFILE_HOME, route = Routes.TAB_PROFILE) {
                composable(Routes.PROFILE_HOME) {
                    ProfileScreen(
                        settings = container.appSettings,
                        backupStatus = backupStatusLine(container.backupPrefs),
                        onOpenBackup = { navController.navigate(Routes.BACKUP) },
                    )
                }

                composable(Routes.BACKUP) {
                    val vm: BackupViewModel = viewModel(
                        factory = BackupViewModel.factory { BackupViewModel(container.backup, container.backupPrefs) }
                    )
                    BackupScreen(viewModel = vm, onBack = { navController.popBackStack() })
                }
            }
        }
    }
}

@Composable
private fun AppBottomBar(navController: NavHostController, currentDestination: NavDestination?) {
    NavigationBar {
        TABS.forEach { tab ->
            val selected = currentDestination?.hierarchy?.any { it.route == tab.route } == true
            NavigationBarItem(
                selected = selected,
                onClick = {
                    navController.navigate(tab.route) {
                        // One back stack per tab: leaving a tab saves where the owner was, coming back restores it.
                        popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                icon = { Text(tab.glyph, fontSize = 18.sp) },
                label = { Text(tab.label, fontSize = 11.sp, maxLines = 1) },
                alwaysShowLabel = true,
            )
        }
    }
}
