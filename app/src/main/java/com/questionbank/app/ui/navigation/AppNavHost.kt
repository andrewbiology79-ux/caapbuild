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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import com.questionbank.app.ui.hierarchy.ReferenceHomeScreen
import com.questionbank.app.ui.hierarchy.ReferenceCatalogScreen
import com.questionbank.app.ui.hierarchy.ReferenceRow
import com.questionbank.app.ui.profile.ProfileScreen
import com.questionbank.app.ui.settings.SettingsScreen
import com.questionbank.app.ui.paper.PaperBuilderScreen
import com.questionbank.app.ui.media.ImageLibraryScreen
import com.questionbank.app.domain.question.QuestionGroupKey
import com.questionbank.app.ui.question.QuestionEditScreen
import com.questionbank.app.ui.question.ChapterCqWorkspaceScreen
import com.questionbank.app.ui.question.QuestionEditViewModel
import com.questionbank.app.ui.question.QuestionEditorScreen
import com.questionbank.app.ui.question.QuestionEditorViewModel
import com.questionbank.app.ui.question.QuestionListScreen
import com.questionbank.app.ui.question.QuestionListViewModel
import com.questionbank.app.ui.question.QuestionDetailScreen
import com.questionbank.app.ui.question.GlobalSearchScreen
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
    const val CHAPTER_CQ_SUBJECTS = "chapter_cq/subjects"
    const val CHAPTER_CQ_CHAPTERS = "chapter_cq/subjects/{subjectId}/chapters"
    const val CHAPTER_CQ_QUESTIONS = "chapter_cq/subjects/{subjectId}/chapters/{chapterId}/questions"
    const val FILTER_HOME = "filter/home"
    const val PROFILE_HOME = "profile/home"
    const val BACKUP = "profile/backup"
    const val MEDIA_LIBRARY = "profile/media"
    const val SETTINGS = "profile/settings"

    const val SUBJECTS = "type_cq/subjects"
    const val CHAPTERS = "type_cq/subjects/{subjectId}/chapters"
    const val TOPICS = "type_cq/chapters/{chapterId}/topics"
    const val QUESTIONS = "type_cq/topics/{topicId}/questions"
    const val QUESTION_EDITOR = "type_cq/topics/{topicId}/questions/new"
    const val QUESTION_EDIT = "type_cq/topics/{topicId}/questions/edit/{groupKey}"
    const val QUESTION_DETAIL = "type_cq/topics/{topicId}/questions/detail/{groupKey}"
    const val REFERENCE_HOME = "type_cq/references"
    const val QUESTION_TYPES = "type_cq/references/question_types"
    const val BOARDS = "type_cq/references/boards"
    const val TYPE_CATEGORIES = "type_cq/references/categories/type"
    const val CHAPTER_CATEGORIES = "type_cq/references/categories/chapter"
    const val SAVED_COUNT_KEY = "savedCount"
    const val EDITED_KEY = "questionEdited"

    fun chapters(subjectId: String) = "type_cq/subjects/$subjectId/chapters"
    fun topics(chapterId: String) = "type_cq/chapters/$chapterId/topics"
    fun questions(topicId: String) = "type_cq/topics/$topicId/questions"
    fun questionEditor(topicId: String) = "type_cq/topics/$topicId/questions/new"
    fun questionEdit(topicId: String, groupKey: String) = "type_cq/topics/$topicId/questions/edit/$groupKey"
    fun questionDetail(topicId: String, groupKey: String) = "type_cq/topics/$topicId/questions/detail/$groupKey"
    fun chapterCqChapters(subjectId: String) = "chapter_cq/subjects/$subjectId/chapters"
    fun chapterCqQuestions(subjectId: String, chapterId: String) = "chapter_cq/subjects/$subjectId/chapters/$chapterId/questions"
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
    // Diagnostic: every screen change (and its arguments) goes to the activity log.
    DisposableEffect(navController) {
        val listener = object : androidx.navigation.NavController.OnDestinationChangedListener {
            override fun onDestinationChanged(
                controller: androidx.navigation.NavController,
                destination: androidx.navigation.NavDestination,
                arguments: android.os.Bundle?,
            ) {
                @Suppress("DEPRECATION")
                val args = arguments?.keySet()?.joinToString(", ") { key -> "$key=${arguments.get(key)}" }.orEmpty()
                com.questionbank.app.ActivityLog.screen(destination.route, args)
            }
        }
        navController.addOnDestinationChangedListener(listener)
        onDispose { navController.removeOnDestinationChangedListener(listener) }
    }
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
                    PaperBuilderScreen(repository = container.papers)
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
                        onManageReferences = { navController.navigate(Routes.REFERENCE_HOME) },
                    )
                }

                composable(
                    route = Routes.REFERENCE_HOME,
                ) {
                    ReferenceHomeScreen(
                        onQuestionTypes = { navController.navigate(Routes.QUESTION_TYPES) },
                        onBoards = { navController.navigate(Routes.BOARDS) },
                        onCategories = { navController.navigate(Routes.TYPE_CATEGORIES) },
                        onChapterCategories = { navController.navigate(Routes.CHAPTER_CATEGORIES) },
                        onBack = { navController.popBackStack() },
                    )
                }

                composable(Routes.QUESTION_TYPES) {
                    val flow = remember { container.typeCqData.observeAllQuestionTypes().map { list -> list.map { ReferenceRow(it.questionTypeId, it.label, it.code, it.isActive == 0L) } } }
                    ReferenceCatalogScreen("Question Type", flow, true, allowAdd = false, allowArchive = false,
                        onAdd = { code, label -> container.typeCqData.addQuestionType(code, label) },
                        onRename = { id, label -> container.typeCqData.renameQuestionType(id, label) },
                        onArchive = { id, archived -> container.typeCqData.setQuestionTypeActive(id, !archived) },
                        onBack = { navController.popBackStack() })
                }

                composable(Routes.BOARDS) {
                    val flow = remember { container.typeCqData.observeBoards().map { list -> list.map { ReferenceRow(it.boardId, it.displayName, it.code, it.isArchived != 0L) } } }
                    ReferenceCatalogScreen("Board ও Year", flow, true,
                        onAdd = { code, label -> container.typeCqData.addBoard(code, label) },
                        onRename = { id, label -> container.typeCqData.renameBoard(id, label) },
                        onArchive = { id, archived -> container.typeCqData.setBoardArchived(id, archived) },
                        onBack = { navController.popBackStack() })
                }

                composable(Routes.TYPE_CATEGORIES) {
                    val flow = remember { container.typeCqData.observeCategories().map { list -> list.map { ReferenceRow(it.categoryId, it.name, archived = it.isArchived != 0L) } } }
                    ReferenceCatalogScreen("Type_CQ Category", flow, false,
                        onAdd = { _, label -> container.typeCqData.addCategory(label) },
                        onRename = { id, label -> container.typeCqData.renameCategory(id, label) },
                        onArchive = { id, archived -> container.typeCqData.setCategoryArchived(id, archived) },
                        onReassign = { source, target -> container.categories.reassignAndArchiveTypeCategory(source, target, System.currentTimeMillis()) },
                        onBack = { navController.popBackStack() })
                }

                composable(Routes.CHAPTER_CATEGORIES) {
                    val flow = remember { container.chapterCq.observeCategories().map { list -> list.map { ReferenceRow(it.categoryId, it.name, archived = it.isArchived != 0L) } } }
                    ReferenceCatalogScreen("Chapter_CQ Category", flow, false,
                        onAdd = { _, label -> container.categories.addChapterCategory(label) },
                        onRename = { id, label -> container.categories.renameChapterCategory(id, label, System.currentTimeMillis()) },
                        onArchive = { id, archived -> container.categories.setChapterCategoryArchived(id, archived, System.currentTimeMillis()) },
                        onReassign = { source, target -> container.categories.reassignAndArchiveChapterCategory(source, target, System.currentTimeMillis()) },
                        onBack = { navController.popBackStack() })
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
                    arguments = listOf(
                        navArgument("chapterId") { type = NavType.StringType },
                    ),
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
                        factory = QuestionListViewModel.factory { QuestionListViewModel(topicId, questionRepo, container.typeCqData.observeCategories(), container.typeCqData.observeQuestionTypes()) }
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
                        onDelete = vm::deleteGroup,
                        onCopy = vm::duplicateGroup,
                        onBulkDelete = vm::deleteGroups,
                        onView = { group -> QuestionGroupKey.of(group)?.let { navController.navigate(Routes.questionDetail(topicId, it)) } },
                        imagePipeline = container.imagePipeline,
                        onBack = { navController.popBackStack() },
                    )
                }

                composable(
                    route = Routes.QUESTION_DETAIL,
                    arguments = listOf(navArgument("topicId") { type = NavType.StringType }, navArgument("groupKey") { type = NavType.StringType }),
                ) { entry ->
                    val topicId = entry.arguments?.getString("topicId").orEmpty()
                    val groupKey = entry.arguments?.getString("groupKey").orEmpty()
                    QuestionDetailScreen(
                        topicId = topicId, groupKey = groupKey, repository = questionRepo, imagePipeline = container.imagePipeline,
                        onEdit = { navController.navigate(Routes.questionEdit(topicId, groupKey)) },
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
                            QuestionEditorViewModel(
                                topicId, questionRepo, container.appScope, container.typeCqData.observeQuestionTypes(),
                                categoriesFlow = container.typeCqData.observeCategories(),
                                duplicateChecker = { text -> container.typeCqData.isDuplicate(topicId, text) },
                                editorDraftRepository = container.editorDrafts,
                                defaultEditorMode = container.appSettings.defaultEditorMode,
                                addCategoryAction = { name -> container.typeCqData.addCategory(name) },
                            )
                        }
                    )
                    val editorTopicName by questionRepo.observeTopicName(topicId).collectAsState(initial = null)
                    QuestionEditorScreen(
                        viewModel = vm,
                        imagePipeline = container.imagePipeline,
                        topicName = editorTopicName,
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
                        factory = QuestionEditViewModel.factory {
                            QuestionEditViewModel(
                                topicId, groupKey, questionRepo, container.appScope,
                                container.typeCqData.observeQuestionTypes(),
                                editorDraftRepository = container.editorDrafts,
                                defaultEditorMode = container.appSettings.defaultEditorMode,
                                categoriesFlow = container.typeCqData.observeCategories(),
                                addCategoryAction = { name -> container.typeCqData.addCategory(name) },
                            )
                        }
                    )
                    QuestionEditScreen(
                        viewModel = vm,
                        imagePipeline = container.imagePipeline,
                        onManageCategories = { navController.navigate(Routes.TYPE_CATEGORIES) },
                        onSaved = {
                            navController.previousBackStackEntry?.savedStateHandle?.set(Routes.EDITED_KEY, true)
                            navController.popBackStack()
                        },
                        onBack = { navController.popBackStack() },
                    )
                }
            }

            navigation(startDestination = Routes.CHAPTER_CQ_SUBJECTS, route = Routes.TAB_CHAPTER_CQ) {
                composable(Routes.CHAPTER_CQ_SUBJECTS) {
                    val chapterRepo = container.chapterCq
                    val vm: HierarchyListViewModel = viewModel(
                        factory = HierarchyListViewModel.factory {
                            HierarchyListViewModel(
                                rowsFlow = chapterRepo.observeSubjectRows(),
                                ancestorsFlow = flowOf(emptyList()),
                                addItem = chapterRepo::addSubjectItem,
                                renameItem = chapterRepo::renameSubjectItem,
                                deleteItem = chapterRepo::deleteSubjectItem,
                                reorderItems = chapterRepo::reorderSubjectItems,
                            )
                        }
                    )
                    HierarchyListScreen(
                        viewModel = vm,
                        labels = SUBJECT_LABELS,
                        onItemClick = { navController.navigate(Routes.chapterCqChapters(it.id)) },
                        onBack = null,
                        rootCrumb = "বিষয় তালিকা",
                    )
                }
                composable(
                    route = Routes.CHAPTER_CQ_CHAPTERS,
                    arguments = listOf(navArgument("subjectId") { type = NavType.StringType }),
                ) { entry ->
                    val subjectId = entry.arguments?.getString("subjectId").orEmpty()
                    val chapterRepo = container.chapterCq
                    val vm: HierarchyListViewModel = viewModel(
                        factory = HierarchyListViewModel.factory {
                            HierarchyListViewModel(
                                rowsFlow = chapterRepo.observeChapterRows(subjectId),
                                ancestorsFlow = chapterRepo.observeSubjects().map { rows -> listOfNotNull(rows.firstOrNull { it.subjectId == subjectId }?.name) },
                                addItem = { name -> chapterRepo.addChapterItem(subjectId, name) },
                                renameItem = chapterRepo::renameChapterItem,
                                deleteItem = chapterRepo::deleteChapterItem,
                                reorderItems = { ids -> chapterRepo.reorderChapterItems(subjectId, ids) },
                            )
                        }
                    )
                    HierarchyListScreen(
                        viewModel = vm,
                        labels = CHAPTER_LABELS.copy(childUnit = null),
                        onItemClick = { navController.navigate(Routes.chapterCqQuestions(subjectId, it.id)) },
                        onBack = { navController.popBackStack() },
                        rootCrumb = "বিষয় তালিকা",
                        onCrumbClick = { index -> if (index == 0) navController.popBackStack(Routes.CHAPTER_CQ_SUBJECTS, false) },
                    )
                }
                composable(
                    route = Routes.CHAPTER_CQ_QUESTIONS,
                    arguments = listOf(
                        navArgument("subjectId") { type = NavType.StringType },
                        navArgument("chapterId") { type = NavType.StringType },
                    ),
                ) { entry ->
                    val subjectId = entry.arguments?.getString("subjectId").orEmpty()
                    val chapterId = entry.arguments?.getString("chapterId").orEmpty()
                    ChapterCqWorkspaceScreen(
                        repository = container.chapterCq,
                        referenceRepository = container.typeCqData,
                        categoryRepository = container.categories,
                        draftRepository = container.editorDrafts,
                        draftScope = container.appScope,
                        imagePipeline = container.imagePipeline,
                        defaultEditorMode = container.appSettings.defaultEditorMode,
                        fixedSubjectId = subjectId,
                        fixedChapterId = chapterId,
                        onBack = { navController.popBackStack() },
                    )
                }
            }

            navigation(startDestination = Routes.FILTER_HOME, route = Routes.TAB_FILTER) {
                composable(Routes.FILTER_HOME) {
                    GlobalSearchScreen(
                        searchUseCase = container.globalQuestionSearch,
                        boardsFlow = container.typeCqQuestions.observeBoards(),
                        typeCategoriesFlow = container.typeCqData.observeCategories(),
                        chapterCategoriesFlow = container.chapterCq.observeCategories(),
                        questionTypesFlow = container.typeCqData.observeQuestionTypes(),
                        chapterRepository = container.chapterCq,
                        typeHierarchy = container.typeCqHierarchy,
                        highlightSearchTerms = container.appSettings.highlightSearchTerms,
                        imagePipeline = container.imagePipeline,
                        onOpenTypeCq = { hit ->
                            val groupKey = hit.stimulusId?.let { "s-$it" } ?: "q-${hit.questionId}"
                            navController.navigate(Routes.questionDetail(hit.containerId, groupKey))
                        },
                    )
                }
            }

            navigation(startDestination = Routes.PROFILE_HOME, route = Routes.TAB_PROFILE) {
                composable(Routes.PROFILE_HOME) {
                    ProfileScreen(
                        settings = container.appSettings,
                        backupStatus = backupStatusLine(container.backupPrefs),
                        onOpenBackup = { navController.navigate(Routes.BACKUP) },
                        onOpenMedia = { navController.navigate(Routes.MEDIA_LIBRARY) },
                        onOpenSettings = { navController.navigate(Routes.SETTINGS) },
                    )
                }

                composable(Routes.SETTINGS) {
                    SettingsScreen(settings = container.appSettings, onBack = { navController.popBackStack() })
                }

                composable(Routes.MEDIA_LIBRARY) {
                    ImageLibraryScreen(
                        pipeline = container.imagePipeline,
                        typeImagesFlow = container.media.observeTypeImages(),
                        chapterImagesFlow = container.media.observeChapterImages(),
                        onBack = { navController.popBackStack() },
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
